const { threatPatterns } = require('./patterns');

function analyzeSecurity(content) {
  const threats = [];
  const detailedThreats = [];
  let sanitized = content;
  const originalLength = content.length;

  // Scan for all threat patterns
  threatPatterns.forEach(pattern => {
    const matches = [...content.matchAll(pattern.regex)];
    
    matches.forEach(match => {
      threats.push(pattern.type);
      
      detailedThreats.push({
        type: pattern.type,
        severity: pattern.severity,
        match: match[0],
        position: match.index,
      });

      // Sanitize by replacing with redaction
      sanitized = sanitized.replace(
        match[0],
        `[🚨 REDACTED: ${pattern.type}]`
      );
    });
  });

  // Calculate risk score
  const riskScore = calculateRiskScore(detailedThreats);
  const riskLevel = getRiskLevel(riskScore);

  // Calculate content reduction percentage
  const sanitizedLength = sanitized.length;
  const reduction = ((sanitizedLength - originalLength) / originalLength * 100).toFixed(2);

  return {
    threats,
    riskScore,
    riskLevel,
    sanitizedContent: sanitized,
    contentReduction: reduction,
    detailedThreats,
  };
}

function calculateRiskScore(threats) {
  if (threats.length === 0) return 0;

  let score = 0;
  const criticalCount = threats.filter(t => t.severity === 'CRITICAL').length;
  const highCount = threats.filter(t => t.severity === 'HIGH').length;
  const mediumCount = threats.filter(t => t.severity === 'MEDIUM').length;

  score = criticalCount * 25 + highCount * 15 + mediumCount * 5;
  score = Math.min(score, 100);

  return score;
}

function getRiskLevel(score) {
  if (score === 0) return 'clean';
  if (score < 15) return 'low';
  if (score < 40) return 'medium';
  if (score < 70) return 'high';
  return 'critical';
}

module.exports = { analyzeSecurity, calculateRiskScore, getRiskLevel };