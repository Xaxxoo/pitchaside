'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/brand';
import { NigerianLocationPicker } from '@/components/nigerian-location-picker';
import { Pagination } from '@/components/pagination';
import { browseCompetitions, formatCurrency } from '@/lib/api';
import type { ICompetition } from '@pitchaside/shared';
import { CompetitionFormat, CompetitionScope, CompetitionStatus } from '@pitchaside/shared';

const STATUS_LABELS: Record<string, string> = {
  [CompetitionStatus.REGISTRATION_OPEN]: 'Registration Open',
  [CompetitionStatus.REGISTRATION_CLOSED]: 'Registration Closed',
  [CompetitionStatus.IN_PROGRESS]: 'In Progress',
};

export default function BrowseCompetitionsPage() {
  const [competitions, setCompetitions] = useState<ICompetition[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<CompetitionScope | ''>('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');

  useEffect(() => {
    setLoading(true);
    browseCompetitions(
      { scope: scope || undefined, state: state || undefined, city: city || undefined },
      page,
      10,
    )
      .then((res) => {
        setCompetitions(res.data);
        setMeta(res.meta);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, scope, state, city]);

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-ink/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Logo href="/" />
          <Link href="/signin" className="text-xs font-bold text-ink hover:underline">
            Sign in
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-extrabold text-ink">Competitions</h1>
        <p className="text-sm text-gray-500 mt-1 mb-6">Browse open tournaments and register your team.</p>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as CompetitionScope | '');
              setState('');
              setCity('');
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 bg-white"
          >
            <option value="">All scopes</option>
            <option value={CompetitionScope.NATIONWIDE}>Nationwide</option>
            <option value={CompetitionScope.STATE}>State</option>
            <option value={CompetitionScope.CITY}>City</option>
          </select>

          {(scope === CompetitionScope.STATE || scope === CompetitionScope.CITY) && (
            <NigerianLocationPicker
              state={state}
              city={city}
              onStateChange={(s) => { setState(s); setCity(''); setPage(1); }}
              onCityChange={(c) => { setCity(c); setPage(1); }}
            />
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : competitions.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-lg font-bold text-ink">No competitions found</p>
            <p className="text-sm text-gray-500 mt-1">Try a different filter or check back later.</p>
          </div>
        ) : (
          <>
            <div className="grid gap-3">
              {competitions.map((comp) => (
                <Link
                  key={comp.id}
                  href={`/competitions/${comp.id}`}
                  className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-ink truncate">{comp.name}</h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700">
                          {STATUS_LABELS[comp.status] ?? comp.status}
                        </span>
                        <span className="text-[11px] text-gray-500">
                          {comp.format === CompetitionFormat.KNOCKOUT ? 'Knockout' : 'League'}
                          {comp.state ? ` \u00b7 ${comp.state}` : ''}
                          {comp.city ? `, ${comp.city}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        {Number(comp.entryFee) > 0 && <span>{formatCurrency(Number(comp.entryFee))} entry</span>}
                        {comp.startDate && <span>Starts {new Date(comp.startDate).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 shrink-0 mt-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
            <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} limit={meta.limit} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
