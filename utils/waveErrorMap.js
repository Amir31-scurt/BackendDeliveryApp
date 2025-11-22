export const waveErrorMap = {
  "recipient-limit-exceeded": "Le destinataire a atteint sa limite mensuelle.",
  "invalid-recipient": "Le numéro Wave du bénéficiaire est invalide.",
  "insufficient-balance": "Solde insuffisant pour effectuer ce payout.",
  "invalid-currency": "Devise invalide.",
  "network-error": "Erreur réseau. Veuillez réessayer.",
  "recipient-blocked": "Le bénéficiaire est temporairement bloqué.",
  "unknown-error": "Une erreur inconnue est survenue."
};

export function translateWaveError(code, originalMsg) {
  return waveErrorMap[code] || `Erreur Wave: ${originalMsg}`;
}
