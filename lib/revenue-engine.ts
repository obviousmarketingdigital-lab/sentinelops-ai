export interface LeadCampaign {
  id: string;
  targetNiche: string;
  region: string;
  potentialLeads: number;
  conversionRateEst: string;
  status: 'ACTIVE' | 'OPTIMIZING' | 'PAUSED';
  generatedAt: string;
}

export interface CheckoutPlan {
  planId: string;
  name: string;
  priceUSD: number;
  billingInterval: 'monthly' | 'annual';
  features: string[];
}

export function getRevenueCampaigns(): LeadCampaign[] {
  return [
    {
      id: 'camp_01',
      targetNiche: 'SaaS Startup Founders (US/EU)',
      region: 'Global / Remote',
      potentialLeads: 1450,
      conversionRateEst: '4.8%',
      status: 'ACTIVE',
      generatedAt: new Date().toISOString()
    },
    {
      id: 'camp_02',
      targetNiche: 'Real Estate Agencies (LatAm)',
      region: 'Brazil / Mercosur',
      potentialLeads: 890,
      conversionRateEst: '6.2%',
      status: 'ACTIVE',
      generatedAt: new Date().toISOString()
    },
    {
      id: 'camp_03',
      targetNiche: 'DevOps Engineering Leads',
      region: 'Enterprise Global',
      potentialLeads: 3200,
      conversionRateEst: '3.1%',
      status: 'OPTIMIZING',
      generatedAt: new Date().toISOString()
    },
    {
      id: 'camp_04',
      targetNiche: 'E-commerce & Retail Tech (LatAm/BR)',
      region: 'Brazil / São Paulo',
      potentialLeads: 1200,
      conversionRateEst: '5.5%',
      status: 'ACTIVE',
      generatedAt: new Date().toISOString()
    },
    {
      id: 'camp_05',
      targetNiche: 'Fintech Scale-ups (EU/UK)',
      region: 'London / Berlin',
      potentialLeads: 2100,
      conversionRateEst: '3.9%',
      status: 'ACTIVE',
      generatedAt: new Date().toISOString()
    }
  ];
}

export function getRevenuePlans(): CheckoutPlan[] {
  return [
    {
      planId: 'plan_growth',
      name: 'SentinelOps Growth',
      priceUSD: 149,
      billingInterval: 'monthly',
      features: ['5,000 AI Outreach Leads/mo', 'Automated GitHub PR Sentinel', 'Multi-tenant Org Quotas']
    },
    {
      planId: 'plan_scale',
      name: 'SentinelOps Scale',
      priceUSD: 499,
      billingInterval: 'monthly',
      features: ['Unlimited AI Outreach Leads', 'Advanced Fleet Microservice Supervisor', 'Priority Webhook Pipelines', 'Dedicated Support']
    }
  ];
}

export function generateAICopy(niche: string): { subject: string; body: string } {
  return {
    subject: `Automating DevOps & Revenue Growth for ${niche}`,
    body: `Hi Founder,\n\nWe noticed your engineering and growth teams spend 30+ hours a week reviewing CVE alerts, fixing pipeline issues, and sourcing qualified leads.\n\nOur Autonomous DevOps Sentinel AI agent and SentinelOps Growth Engine detect vulnerabilities, generate code patches, open GitHub PRs, and launch high-converting outreach campaigns automatically with Zero-AWS setup required.\n\nWould you be open to a 5-minute preview of how SentinelOps can scale your revenue and secure your codebase this week?\n\nBest,\nAutonomous AI Growth & DevOps Agent`
  };
}
