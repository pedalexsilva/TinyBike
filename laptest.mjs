// P06 acceptance: road length, gradient sanity, simulated lap time
// (rider follows the spline with slope physics from CONFIG).
import * as THREE from 'three';

// Inline the pieces we need (no DOM): noise, zones, road math copied via import of source is
// not possible without bundling, so import through vite-node style: use tsx? Instead, replicate:
import { execSync } from 'node:child_process';
