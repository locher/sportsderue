import { BottomSheet } from './BottomSheet'

interface Props {
  open: boolean
  onClose: () => void
}

export function AboutSheet({ open, onClose }: Props) {
  return (
    <BottomSheet open={open} title="À propos" onClose={onClose}>
      <div className="space-y-4 pb-4 text-sm leading-relaxed">
        <p>
          <strong>Sports de rue</strong> cartographie les équipements sportifs mis à disposition
          gratuitement par les collectivités : city-stades, terrains de basket, tables de
          ping-pong, skateparks, aires de fitness, terrains de pétanque… et les aires de jeux
          pour enfants.
        </p>

        <section>
          <h3 className="display mb-1.5 text-base">D’où viennent les données ?</h3>
          <p>
            Du{' '}
            <a
              href="https://equipements.sports.gouv.fr/explore/dataset/data-es/"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-ink underline decoration-lime decoration-2 underline-offset-2"
            >
              Recensement des équipements sportifs (Data ES)
            </a>{' '}
            du ministère chargé des Sports : plus de 330 000 équipements et lieux de pratique,
            mis à jour quotidiennement. Le fond de carte et la recherche d’adresse viennent de la{' '}
            <a
              href="https://geoservices.ign.fr/services-geoplateforme"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-ink underline decoration-lime decoration-2 underline-offset-2"
            >
              Géoplateforme de l’IGN
            </a>
            .
          </p>
          <p className="mt-2">
            Les <strong>aires de jeux pour enfants</strong> font exception : elles ne sont
            recensées dans aucun fichier national — le recensement du ministère ne couvre que le
            sport. Elles viennent d’
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-ink underline decoration-lime decoration-2 underline-offset-2"
            >
              OpenStreetMap
            </a>
            , qui en cartographie près de 46 000 en France. Elles sont relevées à l’avance
            et livrées avec l’application : l’affichage est immédiat et fonctionne
            hors-ligne, mais la donnée date du dernier relevé — sa date figure en bas de
            chaque fiche.
          </p>
        </section>

        <section>
          <h3 className="display mb-1.5 text-base">Comment sont sélectionnés les équipements ?</h3>
          <p>Sont affichés uniquement les équipements :</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>déclarés « en accès libre » par leur propriétaire ;</li>
            <li>
              appartenant à une personne publique (commune, intercommunalité, département,
              région, État) — les salles privées commerciales sont exclues.
            </li>
          </ul>
          <p className="mt-2">
            Pour les aires de jeux, même exigence traduite dans le vocabulaire
            d’OpenStreetMap : celles réservées aux clients d’un commerce, privées ou payantes
            sont écartées, les aires couvertes aussi.
          </p>
          <p className="mt-2 text-muted">
            Ces informations sont déclaratives : un équipement peut être fermé, en travaux ou
            réservé à des créneaux scolaires. Vérifiez sur place.
          </p>
        </section>

        <section>
          <h3 className="display mb-1.5 text-base">Vie privée</h3>
          <p>
            Aucun compte, aucun traceur, aucune donnée envoyée à un serveur tiers hormis les API
            publiques de l’État. Votre position ne quitte jamais votre appareil : elle sert
            uniquement à centrer la carte.
          </p>
        </section>

        <section>
          <h3 className="display mb-1.5 text-base">Une erreur dans une fiche ?</h3>
          <p>
            Les corrections se font auprès du recensement national, via le{' '}
            <a
              href="https://www.sports.gouv.fr/recensement-des-equipements-sportifs-data-es-671"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-ink underline decoration-lime decoration-2 underline-offset-2"
            >
              portail du ministère
            </a>
            , généralement par le service des sports de la commune propriétaire. Pour une aire
            de jeux, la correction se fait directement sur OpenStreetMap : le lien est en bas de
            chaque fiche.
          </p>
        </section>

        <p className="text-xs text-muted">
          Données du ministère sous Licence Ouverte / Open Licence (Etalab), données
          OpenStreetMap sous ODbL. Application indépendante, sans lien officiel avec le
          ministère.
        </p>
      </div>
    </BottomSheet>
  )
}
