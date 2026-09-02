'use client';

import React, { useState, useEffect } from "react";

export function RevenueDashboard() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedNiche, setSelectedNiche] = useState("SaaS Startup Founders (US/EU)");
  const [generatedCopy, setGeneratedCopy] = useState<{ subject: string; body: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const res = await fetch("/api/revenue");
      const data = await res.json();
      if (data.success) {
        setCampaigns(data.campaigns);
        setPlans(data.plans);
      }
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    }
  }

  async function handleGenerateCopy(niche: string) {
    setSelectedNiche(niche);
    setLoading(true);
    try {
      const res = await fetch("/api/revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche }),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedCopy(data.copy);
      }
    } catch (err) {
      console.error("Failed to generate AI copy", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout(planId: string) {
    setCheckoutLoading(planId);
    try {
      setCheckoutError(null);
      const res = await fetch("/api/revenue/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (data.success && data.checkoutUrl) {
        window.open(data.checkoutUrl, "_blank");
      } else {
        // A failed checkout has to be visible. Swallowing it leaves the button
        // looking like it worked.
        setCheckoutError(data.error ?? "Checkout could not be started.");
      }
    } catch {
      setCheckoutError("Checkout request failed.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#07090e] text-[#f8fafc] p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-6 border-b border-emerald-500/20 gap-4">
          <div>
            <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-mono border border-emerald-500/35">
              💰 AUTONOMOUS REVENUE & GROWTH AGENT
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold mt-2 tracking-tight">
              SentinelOps <span className="text-emerald-400">Global Monetization Engine</span>
            </h1>
          </div>
          <div className="flex gap-2">
            <a href="/sentinel" className="px-4 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-mono font-bold transition">
              ← Back to DevOps Sentinel
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Campaigns */}
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Active Global Growth Campaigns</h2>
            <div className="space-y-4">
              {campaigns.map((camp) => (
                <div key={camp.id} className="bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-6 transition flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-0.5 rounded text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{camp.region}</span>
                      <span className="text-xs font-mono text-slate-400">Leads: {camp.potentialLeads}</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-100">{camp.targetNiche}</h3>
                  </div>
                  <button onClick={() => handleGenerateCopy(camp.targetNiche)} className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer">
                    ⚡ Generate AI Outreach
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Checkout */}
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Subscription Plans</h2>
            {checkoutError && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-4 text-sm text-red-300">
                {checkoutError}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {plans.map((plan) => (
                <div key={plan.planId} className="bg-slate-950 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-sky-400">{plan.name}</h3>
                    <div className="text-2xl font-extrabold my-4 text-white">${plan.priceUSD}<span className="text-xs text-slate-400 font-normal">/{plan.billingInterval}</span></div>
                    <ul className="text-xs text-slate-400 space-y-2 font-mono mb-6">
                      {plan.features.map((f: string) => <li key={f}>✓ {f}</li>)}
                    </ul>
                  </div>
                  <button onClick={() => handleCheckout(plan.planId)} className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer" disabled={checkoutLoading === plan.planId}>
                    {checkoutLoading === plan.planId ? 'Processing...' : 'Subscribe Now'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Copy Preview */}
        {generatedCopy && (
          <div className="mt-8 bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-lg font-bold mb-4 text-emerald-400">AI Generated Outreach: {selectedNiche}</h3>
            <div className="space-y-4 font-mono text-xs text-slate-300">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-sky-400 font-bold block mb-1">Subject:</span>{generatedCopy.subject}
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 whitespace-pre-wrap">
                <span className="text-sky-400 font-bold block mb-1">Body:</span>{generatedCopy.body}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
