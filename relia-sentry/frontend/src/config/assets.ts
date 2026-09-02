/**
 * Centralized Asset Configuration for ReliaSentry
 * Satisfies Section 5, 6, 7:
 * "Do not scatter asset paths throughout components."
 * "If an asset is missing: show fallback, clearly label 3D Asset Unavailable — Fallback Simulation Mode"
 */

export interface AssetConfig {
  burnInChamber: string;
  pcbBoard: string;
  component: string;
  satellite: string;
  chamberDoorAnimation: string;
  chamberOperationAnimation: string;
  satelliteLaunchAnimation: string;
  satelliteOrbitAnimation: string;
}

export const ASSET_PATHS: AssetConfig = {
  burnInChamber: '/assets/3d/burn-in-chamber.glb',
  pcbBoard: '/assets/3d/pcb-board.glb',
  component: '/assets/3d/component.glb',
  satellite: '/assets/3d/satellite.glb',
  chamberDoorAnimation: '/assets/animations/chamber-door.glb',
  chamberOperationAnimation: '/assets/animations/chamber-operation.glb',
  satelliteLaunchAnimation: '/assets/animations/satellite-launch.glb',
  satelliteOrbitAnimation: '/assets/animations/satellite-orbit.glb',
};

export const ASSET_STATUS = {
  hasCustom3D: false, // Set to true when .glb files are placed in public/assets/3d/
  fallbackModeLabel: 'Interactive Simulation Mode (High-Fidelity Vector Environment)',
};
