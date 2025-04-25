// src/store/miniappAtoms.ts
import { atom } from 'jotai';
import type { MiniappConfig, MiniappDefinition } from '../types';

// Holds all defined Miniapps
export const miniappsDefinitionAtom = atom<MiniappDefinition[]>([]);

// Holds the configurations for all Miniapps, keyed by their ID
export const miniappsConfigAtom = atom<Record<string, MiniappConfig>>({});

// Holds the IDs of Miniapps that are currently running (active)
export const activeMiniappIdsAtom = atom<Set<string>>(new Set<string>());

// Derived atom to easily get the definitions of active Miniapps
export const activeMiniappsAtom = atom((get) => {
  const definitions = get(miniappsDefinitionAtom);
  const activeIds = get(activeMiniappIdsAtom);
  return definitions.filter((def) => activeIds.has(def.id));
});

// Derived atom to easily get active configurations
export const activeMiniappsConfigsAtom = atom((get) => {
  const allConfigs = get(miniappsConfigAtom);
  const activeIds = get(activeMiniappIdsAtom);
  const activeConfigs: Record<string, MiniappConfig> = {};
  activeIds.forEach((id) => {
    activeConfigs[id] = allConfigs[id] || {}; // Provide empty object if no config saved yet
  });
  return activeConfigs;
});
