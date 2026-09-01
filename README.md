# 🤖 DevOps Sentinel

> **Autonomous AI Agent & DevOps Optimizer — Zero Cloud Credentials Required.**

[![Sentinel Security](http://localhost:3009/api/sentinel/badge)](https://github.com/obviousmarketingdigital-lab/sentinel-devops-agent)
[![Next.js 16](https://img.shields.io/badge/Next.js-16.3.3-black?style=flat&logo=next.js)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**DevOps Sentinel** is an autonomous agent engine built to audit local codebases, Dockerfiles, and multi-microservice fleets, generate precise AI code patches, and automatically open GitHub Pull Requests without requiring complex AWS accounts or paid cloud setups.

---

## 🌟 Key Features

- **💻 Zero-AWS Local & Docker Audit**: Scans package dependencies, TypeScript strictness, container layers, and codebase health instantly.
- **🤖 Generative AI Patcher (`lib/ai-patcher.ts`)**: Automatically crafts precise code fixes, dependency optimizations, and Dockerfile modernizations.
- **🐙 Autonomous GitHub PR Creator (`lib/github-service.ts`)**: Creates branches, writes files via Base64, and opens Pull Requests automatically.
- **🛡️ CVE & Security Scanner**: Detects known vulnerabilities (Prototype Pollution, SSRF) with fixed-version mapping.
- **🏢 Multi-Tenant SaaS & Quota Management**: Built-in organization billing tiers (Free, Pro, Enterprise) with quota tracking.
- **🌐 Multi-Microservice Fleet Supervisor**: Monitors distributed services, tracks health scores, and triggers autonomous sweeps.
- **📊 Dynamic SVG Health Badges**: Real-time shield badges (`/api/sentinel/badge`) for repository README integration.

---

## 🚀 Quick Start

1. **Clone the repository**:
   ```bash
   git clone https://github.com/obviousmarketingdigital-lab/sentinel-devops-agent.git
   cd sentinel-devops-agent
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables** (optional for real GitHub PRs):
   Create a `.env.local` file in the root directory:
   ```env
   GITHUB_TOKEN=ghp_your_personal_access_token_here
   GITHUB_OWNER=your-github-username
   GITHUB_REPO=sentinel-devops-agent
   ```

4. **Run the development server**:
   ```bash
   npm run dev -- -p 3009
   ```

5. **Open the Sentinel Dashboard**:
   Navigate to **[http://localhost:3009/sentinel](http://localhost:3009/sentinel)** in your browser.

---

## 🛠️ Architecture

```
sentinel-devops-agent/
├── app/
│   ├── api/sentinel/
│   │   ├── analyze/          # Cloud cost anomaly telemetry
│   │   ├── badge/            # Dynamic SVG health badge generator
│   │   ├── local-fix/        # Autonomous AI patcher & GitHub PR creator
│   │   ├── microservices/    # Fleet health supervisor
│   │   └── saas/             # Organization billing & quota tier management
│   └── sentinel/             # Next.js interactive client dashboard
├── components/
│   └── sentinel-dashboard.tsx # Real-time agent terminal stream & UI tabs
└── lib/
    ├── ai-patcher.ts         # Generative AI code & docker patcher
    ├── cloud-analyzer.ts     # AWS cost optimization simulator
    ├── data-store.ts         # Persistent fixes storage
    ├── github-service.ts     # GitHub REST API client
    ├── local-project-analyzer.ts # Static code & dependency audit
    ├── microservices-monitor.ts  # Fleet microservice health tracker
    ├── saas-auth.ts          # Multi-tenant organization schemas
    └── security-scanner.ts   # CVE vulnerability scanner
```

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

*Built with ❤️ by the Autonomous DevOps Agent.*
