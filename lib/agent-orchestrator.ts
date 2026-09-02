import type { CloudResourceAnomaly } from './cloud-analyzer';

export interface RemediationStep {
  name: string;
  description: string;
  /** Every step is 'planned'. Nothing here runs against a real account. */
  status: 'planned';
}

export interface RemediationPlan {
  anomalyId: string;
  executed: false;
  reason: string;
  estimatedMonthlySavingsUSD: number;
  steps: RemediationStep[];
}

/**
 * Describes the work a remediation would involve for a given anomaly.
 *
 * It does not execute anything, and deliberately reports no pull request and no
 * secured savings: the anomalies it receives are sample data, and there is no
 * cloud account, Terraform state or CI pipeline connected to act on.
 */
export function planRemediation(anomaly: CloudResourceAnomaly): RemediationPlan {
  return {
    anomalyId: anomaly.id,
    executed: false,
    reason:
      'No cloud account is connected, and this anomaly comes from the sample dataset, so nothing was changed.',
    estimatedMonthlySavingsUSD: anomaly.potentialMonthlySavingsUSD,
    steps: [
      {
        name: 'Locate the resource definition',
        description: `Find ${anomaly.resourceName} in the Terraform or CDK sources that own it.`,
        status: 'planned',
      },
      {
        name: 'Check blast radius',
        description: 'Identify dependents and confirm the change cannot breach an SLA.',
        status: 'planned',
      },
      {
        name: 'Draft the change',
        description: anomaly.recommendedAction,
        status: 'planned',
      },
      {
        name: 'Open a pull request for review',
        description: 'Submit the change with its cost impact for a human to approve.',
        status: 'planned',
      },
    ],
  };
}
