'use client';

import type { HPDViolation, DOBViolation, DOBPermit } from '@/types/database';
import type { BuildingHealthScore } from '@/lib/property-service';

interface ViolationsPanelProps {
  hpdViolations: HPDViolation[];
  dobViolations: DOBViolation[];
  dobPermits: DOBPermit[];
  buildingHealth: BuildingHealthScore;
  lastUpdated: {
    hpd: string | null;
    dob: string | null;
    permits: string | null;
  };
}

function ViolationClassBadge({ violationClass }: { violationClass: string }) {
  const colors: Record<string, string> = {
    'A': 'bg-yellow-100 text-yellow-800',
    'B': 'bg-orange-100 text-orange-800',
    'C': 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[violationClass] || 'bg-gray-100 text-gray-800'}`}>
      Class {violationClass}
    </span>
  );
}

function HealthGradeBadge({ grade, score }: { grade: string; score: number }) {
  const colors: Record<string, string> = {
    'A': 'bg-green-500',
    'B': 'bg-lime-500',
    'C': 'bg-yellow-500',
    'D': 'bg-orange-500',
    'F': 'bg-red-500',
  };

  return (
    <div className="flex items-center gap-3">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-3xl font-bold ${colors[grade] || 'bg-gray-500'}`}>
        {grade}
      </div>
      <div>
        <div className="text-sm text-gray-500">Health Score</div>
        <div className="font-semibold">{score}/100</div>
      </div>
    </div>
  );
}

export function ViolationsPanel({
  hpdViolations,
  dobViolations,
  dobPermits,
  buildingHealth,
  lastUpdated,
}: ViolationsPanelProps) {
  const openHPD = hpdViolations.filter(v => !v.close_date);
  const openDOB = dobViolations.filter(v => !v.disposition_date);

  return (
    <div className="space-y-6">
      {/* Building Health Score */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Building Health Score</h3>
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <HealthGradeBadge grade={buildingHealth.grade} score={buildingHealth.score} />
          <div className="flex-1">
            <p className="text-gray-600">{buildingHealth.explanation}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {buildingHealth.breakdown.hpdClassC > 0 && (
                <span className="text-red-600">{buildingHealth.breakdown.hpdClassC} Class C</span>
              )}
              {buildingHealth.breakdown.hpdClassB > 0 && (
                <span className="text-orange-600">{buildingHealth.breakdown.hpdClassB} Class B</span>
              )}
              {buildingHealth.breakdown.hpdClassA > 0 && (
                <span className="text-yellow-600">{buildingHealth.breakdown.hpdClassA} Class A</span>
              )}
              {buildingHealth.breakdown.dobOpen > 0 && (
                <span className="text-gray-600">{buildingHealth.breakdown.dobOpen} DOB</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* HPD Violations */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            HPD Violations
            {openHPD.length > 0 && (
              <span className="ml-2 text-sm font-normal text-red-600">
                ({openHPD.length} open)
              </span>
            )}
          </h3>
          <a
            href="https://data.cityofnewyork.us/Housing-Development/Housing-Maintenance-Code-Violations/wvxf-dwi5"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            View on HPD
          </a>
        </div>

        {openHPD.length === 0 ? (
          <p className="text-green-600">No open HPD violations</p>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {openHPD.slice(0, 10).map((violation, idx) => (
              <div key={violation.violation_id || idx} className="border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <ViolationClassBadge violationClass={violation.class} />
                  {violation.apartment && (
                    <span className="text-sm text-gray-500">Apt {violation.apartment}</span>
                  )}
                  {violation.open_date && (
                    <span className="text-sm text-gray-400">
                      {new Date(violation.open_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-700">{violation.description || 'No description'}</p>
              </div>
            ))}
            {openHPD.length > 10 && (
              <p className="text-sm text-gray-500">+ {openHPD.length - 10} more violations</p>
            )}
          </div>
        )}

        {lastUpdated.hpd && (
          <div className="mt-4 text-xs text-gray-400">
            Data as of {new Date(lastUpdated.hpd).toLocaleDateString()}
          </div>
        )}
      </div>

      {/* DOB Violations */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            DOB Violations
            {openDOB.length > 0 && (
              <span className="ml-2 text-sm font-normal text-red-600">
                ({openDOB.length} open)
              </span>
            )}
          </h3>
          <a
            href="https://data.cityofnewyork.us/Housing-Development/DOB-Violations/3h2n-5cm9"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            View on DOB
          </a>
        </div>

        {openDOB.length === 0 ? (
          <p className="text-green-600">No open DOB violations</p>
        ) : (
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {openDOB.slice(0, 5).map((violation, idx) => (
              <div key={violation.violation_id || idx} className="border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  {violation.violation_type && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-800 rounded text-xs">
                      {violation.violation_type}
                    </span>
                  )}
                  {violation.issue_date && (
                    <span className="text-sm text-gray-400">
                      {new Date(violation.issue_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-700">{violation.description || 'No description'}</p>
              </div>
            ))}
          </div>
        )}

        {lastUpdated.dob && (
          <div className="mt-4 text-xs text-gray-400">
            Data as of {new Date(lastUpdated.dob).toLocaleDateString()}
          </div>
        )}
      </div>

      {/* DOB Permits */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            DOB Permits
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({dobPermits.length} total)
            </span>
          </h3>
          <a
            href="https://data.cityofnewyork.us/Housing-Development/DOB-Permit-Issuance/ipu4-2q9a"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            View on DOB
          </a>
        </div>

        {dobPermits.length === 0 ? (
          <p className="text-gray-500">No permits on file</p>
        ) : (
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {dobPermits.slice(0, 5).map((permit, idx) => (
              <div key={permit.permit_number || idx} className="border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                    {permit.permit_type || permit.job_type || 'Permit'}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    permit.status.toLowerCase().includes('issued')
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {permit.status}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{permit.description || 'No description'}</p>
                <div className="text-xs text-gray-400 mt-1">
                  Filed: {permit.filing_date ? new Date(permit.filing_date).toLocaleDateString() : 'N/A'}
                  {permit.expiration_date && ` | Expires: ${new Date(permit.expiration_date).toLocaleDateString()}`}
                </div>
              </div>
            ))}
          </div>
        )}

        {lastUpdated.permits && (
          <div className="mt-4 text-xs text-gray-400">
            Data as of {new Date(lastUpdated.permits).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}
