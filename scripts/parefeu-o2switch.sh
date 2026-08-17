#!/usr/bin/env bash
#
# Autorise (ou retire) une adresse IP dans la liste blanche SSH d'o2switch.
#
# Pourquoi ce script existe : o2switch filtre l'accès SSH par liste blanche d'adresses IP,
# et les runners GitHub en changent à chaque exécution. Leur documentation laisse entendre
# que GitHub est peut-être déjà autorisé, sans le garantir. Plutôt que de parier, on ouvre
# la porte juste avant de passer et on la referme derrière — c'est exactement le motif que
# o2switch publie lui-même dans ses workflows d'exemple.
#
# L'API est celle de cPanel (UAPI), sur le port 2083, qui n'est soumis à aucun filtre.
# L'authentification se fait par **jeton d'API** (cPanel → Gérer les jetons d'API) et non
# par le mot de passe du compte : un jeton se révoque seul, sans changer le mot de passe.
#
#   O2SWITCH_CPANEL_SERVEUR   nom d'hôte du serveur (xxx.o2switch.net)
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

# `--fail-with-body` fait ressortir un code HTTP d'erreur sans jeter la réponse, qui porte
# l'explication. Pas de `-k` : le certificat du port 2083 est valide pour le nom d'hôte du
# serveur, donc une erreur de vérification est une vraie information, pas une gêne.
uapi() {
  curl -sS --max-time 45 --fail-with-body \
    -H "Authorization: cpanel ${O2SWITCH_CPANEL_LOGIN}:${O2SWITCH_CPANEL_TOKEN}" \
    "https://${O2SWITCH_CPANEL_SERVEUR}:2083/execute/SshWhitelist/$1"
}

case "$action" in
  liste)
    uapi list | jq .
    ;;

  autorise)
    [ -n "$ip" ] || { echo "Usage : $0 autorise <ip>" >&2; exit 2; }

    # L'état courant est affiché avant d'ajouter : le compte n'a droit qu'à **5
    # exceptions**, et un échec d'ajout se comprend mal sans savoir ce qu'il y avait déjà.
    echo "Exceptions déjà en place :"
    uapi list | jq -c '.data[]? | {address, port, direction}' || true

    reponse=$(uapi "add?address=${ip}&port=${PORT}")
    if printf '%s' "$reponse" | jq -e '.status == 1' >/dev/null 2>&1; then
      echo "IP ${ip} autorisée sur le port ${PORT}."
    else
      printf '%s\n' "$reponse" | jq . 2>/dev/null || printf '%s\n' "$reponse"
      echo "Échec de l’ajout. Cause la plus fréquente : les 5 exceptions autorisées sont" >&2
      echo "déjà prises — les nettoyer dans cPanel → Autorisation SSH. Ne pas utiliser" >&2
      echo "remove_all sans y penser, il supprimerait aussi votre propre accès." >&2
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
