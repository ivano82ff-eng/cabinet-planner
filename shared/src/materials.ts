export interface Material {
  id: string;
  name: string;
  color: string;
  pricePerM2: number;
  edgePerM: number;
}

export const MATERIALS: readonly Material[] = [
  { id: 'white', name: 'ЛДСП белый', color: '#f3f0e8', pricePerM2: 1450, edgePerM: 42 },
  { id: 'oak', name: 'ЛДСП дуб сонома', color: '#c6a36a', pricePerM2: 1890, edgePerM: 58 },
  { id: 'walnut', name: 'ЛДСП орех', color: '#6e4632', pricePerM2: 2140, edgePerM: 64 },
  { id: 'graphite', name: 'ЛДСП графит', color: '#4a4e55', pricePerM2: 1760, edgePerM: 50 },
  { id: 'sage', name: 'ЛДСП шалфей', color: '#8ea396', pricePerM2: 1980, edgePerM: 56 },
];

export const HDF: Material = {
  id: 'hdf',
  name: 'ДВП',
  color: '#e4dccb',
  pricePerM2: 390,
  edgePerM: 0,
};

export const CATALOG: readonly Material[] = [...MATERIALS, HDF];

export function getMaterial(id: string): Material {
  return CATALOG.find((item) => item.id === id) ?? MATERIALS[0];
}
