import type { CategoryId, DataSource } from './lib/sports'

/** Équipement tel que manipulé par l'interface (version allégée de l'enregistrement Data ES). */
export interface Equipment {
  /**
   * `equip_numero` (identifiant national) pour le RES, `osm:way/12345` pour une aire
   * de jeux OpenStreetMap. Le préfixe garantit qu'aucune collision n'est possible.
   */
  id: string
  /** Base d'origine : le RES du ministère, ou OpenStreetMap pour les aires de jeux. */
  source: DataSource
  name: string
  /** Nom de l'installation qui porte l'équipement (`inst_nom`). */
  installation: string | null
  type: string
  /** Activités praticables déclarées (`aps_name`). */
  sports: string[]
  address: string | null
  postcode: string | null
  city: string | null
  /** `equip_nature` : Découvert, Intérieur, Site naturel… */
  nature: string | null
  /** `equip_eclair` : présence d'un éclairage. */
  lit: boolean
  /** `equip_pmr_acc` : accès PMR à l'aire de pratique. */
  accessible: boolean
  lon: number
  lat: number
  category: CategoryId
  /** Distance à vol d'oiseau depuis le point de référence, en mètres. */
  distance?: number
}

/** Champs supplémentaires chargés à la demande sur la fiche détaillée. */
export interface EquipmentDetail extends Equipment {
  floor: string | null
  length: number | null
  width: number | null
  surface: number | null
  showers: boolean
  toilets: boolean
  changingRooms: boolean
  ownerName: string | null
  ownerType: string | null
  managerType: string | null
  serviceDate: string | null
  worksDate: string | null
  seasonal: boolean
  url: string | null
  notes: string | null
  installationNotes: string | null
  updatedAt: string | null
  department: string | null
  region: string | null
  /** Tranche d'âge affichée (« 3 à 12 ans ») — aires de jeux OpenStreetMap uniquement. */
  ageRange?: string | null
  /** Horaires d'ouverture bruts — aires de jeux OpenStreetMap uniquement. */
  openingHours?: string | null
}

export interface Bbox {
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
}

export interface LngLat {
  lon: number
  lat: number
}

export interface Filters {
  categories: CategoryId[]
  /** Exclut les équipements en salle. */
  outdoorOnly: boolean
  /** Uniquement les équipements éclairés. */
  litOnly: boolean
  /** Uniquement les équipements accessibles aux personnes à mobilité réduite. */
  accessibleOnly: boolean
}

export interface MapPosition {
  lon: number
  lat: number
  zoom: number
}

/** Résultat de géocodage (API Géoplateforme / Base Adresse Nationale). */
export interface Place {
  id: string
  label: string
  context: string
  lon: number
  lat: number
  kind: 'municipality' | 'street' | 'housenumber' | 'locality' | 'other'
  postcode?: string
  citycode?: string
}
