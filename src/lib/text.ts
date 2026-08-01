/**
 * Deux libellés qui ne diffèrent que par la ponctuation, la casse ou les accents
 * (« Le Plan - Montesquieu » et « Le Plan Montesquieu »).
 *
 * Sert partout où un titre risque d'être suivi de lui-même : beaucoup d'équipements
 * du RES sont nommés d'après leur type, et trois aires de jeux sur quatre n'ont
 * aucun nom dans OpenStreetMap.
 */
export function sameLabel(a: string, b: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^\p{Letter}\p{Number}]+/gu, '')
  return normalize(a) === normalize(b)
}
