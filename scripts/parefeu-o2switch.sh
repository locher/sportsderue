#!/usr/bin/env bash
#
# Autorise (ou retire) une adresse IP dans la liste blanche SSH d'o2switch.
#
# Pourquoi ce script existe : o2switch filtre l'accès SSH par liste blanche d'adresses IP,
# et les runners GitHub en changent à chaque exécution. Mesuré, pas supposé — les plages
# GitHub ne sont pas autorisées d'office, contrairement à ce que laisse entendre leur
# documentation. On ouvre donc la porte juste avant de passer et on la referme derrière,
# comme dans les workflows d'exemple que o2switch publie.
#
# L'API est celle de cPanel (UAPI), sur le port 2083, qui n'est soumis à aucun filtre.
# L'authentification se fait par **jeton d'API** (cPanel → Jetons d'API, ou
# `uapi Tokens create_full_access name=…` si l'interface est en panne) et non par le mot de
# passe du compte : un jeton se révoque seul.
#
#   O2SWITCH_CPANEL_SERVEUR   nom d'hôte joignable en HTTPS sur 2083, dont le certificat
#                             porte ce nom (le « Nom du serveur » de cPanel)
#   O2SWITCH_CPANEL_LOGIN     identifiant cPanel
#   O2SWITCH_CPANEL_TOKEN     jeton d'API
#
# Usage :
#   scripts/parefeu-o2switch.sh liste
#   scripts/parefeu-o2switch.sh autorise 1.2.3.4
#   scripts/parefeu-o2switch.sh retire   1.2.3.4
#
# Le jeton passe par l'environnement et jamais par la ligne de commande : sur une machine
# partagée, `ps` la donnerait à lire à tout le monde.

set -euo pipefail

action=${1:-}
ip=${2:-}
PORT=22

: "${O2SWITCH_CPANEL_SERVEUR:?nom d’hôte du serveur cPanel manquant}"
: "${O2SWITCH_CPANEL_LOGIN:?identifiant cPanel manquant}"
: "${O2SWITCH_CPANEL_TOKEN:?jeton d’API cPanel manquant}"

# Renvoie le corps de la réponse sur stdout, et en cas d'échec un diagnostic sur stderr.
#
# Le code HTTP est capturé **séparément du corps** parce que c'est lui qui distingue les
# pannes qui se ressemblent : un jeton refusé (401/403), une fonction absente du serveur
# (404), ou un appel accepté mais refusé sur le fond (200 avec `status: 0`, typiquement le
# plafond de 5 exceptions). Sans cette distinction, on relit trois fois le même message
# sans savoir quoi corriger.
#
# Pas de `-k`, jamais : ce qui transite ici est le jeton d'API du compte. Une erreur de
# vérification du certificat est donc une information, pas une gêne — et elle a une cause
# précise, le port 2083 vérifiant un nom d'hôte là où SSH s'en moque.
uapi() {
  local fichier http reseau=0
  fichier=$(mktemp)

  http=$(curl -sS --max-time 45 -o "$fichier" -w '%{http_code}' \
    -H "Authorization: cpanel ${O2SWITCH_CPANEL_LOGIN}:${O2SWITCH_CPANEL_TOKEN}" \
    "https://${O2SWITCH_CPANEL_SERVEUR}:2083/execute/SshWhitelist/$1") || reseau=$?

  # Le corps est toujours restitué, y compris en erreur : c'est souvent lui qui nomme la
  # cause réelle.
  cat "$fichier"
  rm -f "$fichier"

  if [ "$reseau" = 60 ]; then
    {
      echo "Le certificat de ${O2SWITCH_CPANEL_SERVEUR}:2083 ne couvre pas ce nom."
      echo "Renseigner le secret O2SWITCH_CPANEL_SERVEUR avec le « Nom du serveur » lu dans"
      echo "cPanel → Informations générales : c'est celui que porte le certificat. Le nom"
      echo "utilisé pour SSH n'a pas à être le même."
    } >&2
    return 60
  fi

  if [ "$reseau" != 0 ]; then
    echo "Appel vers ${O2SWITCH_CPANEL_SERVEUR}:2083 impossible (curl $reseau)." >&2
    return "$reseau"
  fi

  if [ "$http" != 200 ]; then
    echo "L'API cPanel a répondu HTTP $http." >&2
    case "$http" in
      401|403)
        echo "Jeton refusé. Vérifier O2SWITCH_CPANEL_TOKEN, et que O2SWITCH_UTILISATEUR est" >&2
        echo "bien l'identifiant cPanel (pas une adresse e-mail)." >&2
        ;;
      404)
        echo "Fonction introuvable : le module SshWhitelist n'est pas exposé par ce serveur," >&2
        echo "ou le nom d'hôte pointe ailleurs que sur l'hébergement." >&2
        ;;
    esac
    return 22
  fi
}

case "$action" in
  liste)
    uapi list | jq .
    ;;

  autorise)
    [ -n "$ip" ] || { echo "Usage : $0 autorise <ip>" >&2; exit 2; }

    # L'état courant d'abord : le compte n'a droit qu'à **5 exceptions**, et un échec
    # d'ajout ne se comprend pas sans savoir ce qu'il y avait déjà.
    echo "Exceptions déjà en place :"
    uapi list | jq -c '.data[]? | {address, port, direction}' || true

    reponse=$(uapi "add?address=${ip}&port=${PORT}") || {
      echo "── réponse de l'API ──" >&2
      printf '%s\n' "${reponse:-(vide)}" >&2
      exit 1
    }

    if printf '%s' "$reponse" | jq -e '.status == 1' >/dev/null 2>&1; then
      echo "IP ${ip} autorisée sur le port ${PORT}."
    else
      printf '%s\n' "$reponse" | jq . 2>/dev/null || printf '%s\n' "$reponse"
      {
        echo "L'API a répondu sans erreur de transport mais a refusé l'ajout."
        echo "Cause la plus fréquente : les 5 exceptions autorisées sont déjà prises — les"
        echo "nettoyer dans cPanel → Autorisation SSH. Ne pas utiliser remove_all sans y"
        echo "penser, il supprimerait aussi votre propre accès."
      } >&2
      exit 1
    fi
    ;;

  retire)
    [ -n "$ip" ] || { echo "Usage : $0 retire <ip>" >&2; exit 2; }

    # Les deux directions, et ce n'est pas du zèle : la documentation d'o2switch précise
    # que sans supprimer `in` **et** `out`, le compteur des 5 exceptions ne redescend pas.
    # On ne fait jamais échouer cette étape : elle tourne en nettoyage, après un
    # déploiement qui a pu échouer pour une autre raison, et masquer la vraie erreur
    # derrière un échec de ménage n'aiderait personne.
    for direction in in out; do
      if uapi "remove?address=${ip}&port=${PORT}&direction=${direction}" >/dev/null 2>&1; then
        echo "IP ${ip} retirée (direction ${direction})."
      else
        echo "Retrait de ${ip} en direction ${direction} sans effet (déjà absente ?)."
      fi
    done
    ;;

  *)
    echo "Usage : $0 {liste|autorise <ip>|retire <ip>}" >&2
    exit 2
    ;;
esac
