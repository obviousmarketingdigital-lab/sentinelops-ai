export const FLEET_SAMPLE_NOTICE =
  'Illustrative fleet. These services are not probed over the network; the health scores and ' +
  'incident counts are fixed sample values kept in memory and reset when the process restarts.';

export interface MicroserviceHealth {
  id: string;
  name: string;
  port: number;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  healthScore: number;
  lastScanned: string;
  activeIncidents: number;
}

let microservicesState: MicroserviceHealth[] = [
  {
    id: 'svc_01',
    name: 'garopaba-frontend-web',
    port: 3009,
    status: 'HEALTHY',
    healthScore: 92,
    lastScanned: new Date().toISOString(),
    activeIncidents: 0
  },
  {
    id: 'svc_02',
    name: 'auth-jwt-service',
    port: 4001,
    status: 'WARNING',
    healthScore: 78,
    lastScanned: new Date().toISOString(),
    activeIncidents: 1
  },
  {
    id: 'svc_03',
    name: 'payment-gateway-worker',
    port: 5002,
    status: 'HEALTHY',
    healthScore: 95,
    lastScanned: new Date().toISOString(),
    activeIncidents: 0
  },
  {
    id: 'svc_04',
    name: 'postgresql-telemetry-sync',
    port: 5432,
    status: 'CRITICAL',
    healthScore: 61,
    lastScanned: new Date().toISOString(),
    activeIncidents: 2
  }
];

export function getMicroservicesStatus(): MicroserviceHealth[] {
  return microservicesState;
}

export function sweepMicroservice(id: string): MicroserviceHealth[] {
  microservicesState = microservicesState.map(svc => {
    if (svc.id === id) {
      return {
        ...svc,
        status: 'HEALTHY',
        healthScore: 100,
        activeIncidents: 0,
        lastScanned: new Date().toISOString()
      };
    }
    return svc;
  });
  return microservicesState;
}
