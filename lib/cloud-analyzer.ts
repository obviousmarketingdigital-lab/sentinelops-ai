export interface CloudResourceAnomaly {
  id: string;
  service: 'AWS EC2' | 'AWS RDS' | 'AWS S3' | 'Kubernetes' | 'Lambda';
  resourceName: string;
  region: string;
  issue: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  potentialMonthlySavingsUSD: number;
  recommendedAction: string;
  autoFixAvailable: boolean;
}

export interface SentinelReport {
  timestamp: string;
  totalMonthlyWasteUSD: number;
  anomaliesCount: number;
  anomalies: CloudResourceAnomaly[];
}

export function analyzeCloudInfrastructure(mockMode = true): SentinelReport {
  if (!mockMode) {
    // Real AWS Cost Explorer & CloudWatch SDK integration would go here
    // using @aws-sdk/client-cost-explorer and @aws-sdk/client-cloudwatch
  }

  // Simulated high-value cloud anomalies detected by the Sentinel Agent
  const anomalies: CloudResourceAnomaly[] = [
    {
      id: 'res-001',
      service: 'AWS EC2',
      resourceName: 'i-09f82a7b3c4e1122a (Production API Node)',
      region: 'us-east-1',
      issue: 'CPU utilization averaging 4.2% over the last 14 days. Oversized instance type (c6i.4xlarge).',
      severity: 'high',
      potentialMonthlySavingsUSD: 640,
      recommendedAction: 'Downsize from c6i.4xlarge to c6i.xlarge',
      autoFixAvailable: true
    },
    {
      id: 'res-002',
      service: 'AWS RDS',
      resourceName: 'prod-postgres-db-replica-2',
      region: 'us-east-1',
      issue: 'Read replica has had 0 read queries in 7 days. Orphaned resource.',
      severity: 'critical',
      potentialMonthlySavingsUSD: 420,
      recommendedAction: 'Terminate unused RDS Read Replica',
      autoFixAvailable: true
    },
    {
      id: 'res-003',
      service: 'AWS S3',
      resourceName: 'bucket-legacy-logs-export-backup',
      region: 'us-west-2',
      issue: '4.8 TB of logs stored in Standard S3 tier without lifecycle transition rules.',
      severity: 'medium',
      potentialMonthlySavingsUSD: 180,
      recommendedAction: 'Apply Lifecycle Rule to transition to Glacier Flexible Archive',
      autoFixAvailable: true
    },
    {
      id: 'res-004',
      service: 'Kubernetes',
      resourceName: 'cluster-k8s-us-east-redis-cache',
      region: 'us-east-1',
      issue: 'Over-provisioned memory requests (requested 32Gi, peak usage 4.1Gi).',
      severity: 'medium',
      potentialMonthlySavingsUSD: 310,
      recommendedAction: 'Update Helm chart memory requests from 32Gi to 8Gi',
      autoFixAvailable: true
    }
  ];

  const totalMonthlyWasteUSD = anomalies.reduce((acc, curr) => acc + curr.potentialMonthlySavingsUSD, 0);

  return {
    timestamp: new Date().toISOString(),
    totalMonthlyWasteUSD,
    anomaliesCount: anomalies.length,
    anomalies
  };
}
