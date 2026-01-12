import type { AssessmentAnalysis } from './assessmentAgent';

export const mapPpmToLabel = (lvl?: number | null) => {
  if (!lvl) return null;
  const labels: Record<number, string> = {
    1: 'Starter',
    2: 'Emergente',
    3: 'Definito',
    4: 'Gestito',
    5: 'Ottimizzato'
  };
  return labels[lvl] || `Livello ${lvl}`;
};

export function deriveProfileFields(analysis: AssessmentAnalysis): AssessmentAnalysis {
  const profile = analysis.profile as any;

  if (!profile.digitalMaturity) {
    profile.digitalMaturity = mapPpmToLabel(profile.ppmMaturityLevel);
  }

  if (typeof profile.innovationIndex !== 'number') {
    if (typeof profile.governanceScore === 'number' && typeof profile.visibilityScore === 'number') {
      profile.innovationIndex = Math.round((profile.governanceScore + profile.visibilityScore) / 2);
    } else {
      profile.innovationIndex = 0;
    }
  }

  return { ...analysis, profile } as AssessmentAnalysis;
}

export default deriveProfileFields;
