const express = require('express');
const { analyzeSecurity } = require('./sanitizer');
const { logAudit } = require('./logger');

const app = express();
app.use(express.json());

// ✅ CORE SECURITY ENDPOINT
app.post('/analyze', async (req, res) => {
  const { content, agent_id = 'unknown', source_type = 'api' } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Content required' });
  }

  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║         🔐 SECURITY ANALYSIS INITIATED              ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  console.log(`📋 Request ID: ${requestId}`);
  console.log(`🤖 Agent ID: ${agent_id}`);
  console.log(`📊 Content Length: ${content.length} chars`);
  console.log(`📍 Source: ${source_type}\n`);

  const analysis = analyzeSecurity(content);
  const certificateId = `cert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const response = {
    request_id: requestId,
    certificate_id: certificateId,
    risk_level: analysis.riskLevel,
    risk_score: analysis.riskScore,
    confidence: 'HIGH',
    threats_detected: analysis.threats.length,
    threats: analysis.threats,
    original_content: content,
    sanitized_content: analysis.sanitizedContent,
    content_reduction: analysis.contentReduction,
    decision: analysis.riskLevel === 'critical' ? 'BLOCK' : 'ALLOW_SANITIZED',
    threat_details: analysis.detailedThreats,
  };

  // Display results in console
  displayAnalysisResults(response);

  // Log for audit trail
  logAudit({
    requestId,
    certificateId,
    agentId: agent_id,
    originalLength: content.length,
    sanitizedLength: response.sanitized_content.length,
    riskLevel: response.risk_level,
    decision: response.decision,
    threats: analysis.threats.length,
  });

  res.json(response);
});

// ✅ HEALTH CHECK
app.get('/health', (req, res) => {
  res.json({ status: 'PromptGuard API is running ✅', timestamp: new Date().toISOString() });
});

function displayAnalysisResults(response) {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║        🛡️  PROMPTGUARD ANALYSIS RESULT             ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const riskEmoji = {
    clean: '✅',
    low: '🟢',
    medium: '🟡',
    high: '🟠',
    critical: '🔴',
  };

  console.log(`Risk Level: ${riskEmoji[response.risk_level]} ${response.risk_level.toUpperCase()}`);
  console.log(`Risk Score: ${response.risk_score}/100`);
  console.log(`Confidence: ${response.confidence}`);
  console.log(`Threats Detected: ${response.threats_detected}\n`);

  if (response.threat_details.length > 0) {
    console.log('📌 THREAT BREAKDOWN:');
    response.threat_details.forEach((threat, idx) => {
      console.log(`   ${idx + 1}. [${threat.severity}] ${threat.type}`);
      console.log(`      Pattern: "${threat.match}"`);
    });
    console.log();
  }

  console.log('📊 CONTENT ANALYSIS:');
  console.log(`   Original: ${response.original_content.length} chars`);
  console.log(`   Sanitized: ${response.sanitized_content.length} chars`);
  console.log(`   Change: ${response.content_reduction}%\n`);

  console.log(`🚨 DECISION: ${response.decision}\n`);

  if (response.decision === 'ALLOW_SANITIZED') {
    console.log('✅ INPUT WILL BE PROCESSED (SANITIZED)\n');
    console.log('📋 ORIGINAL INPUT:');
    console.log('   ' + response.original_content + '\n');
    console.log('🧹 SANITIZED OUTPUT (what LLM will receive):');
    console.log('   ' + response.sanitized_content + '\n');
  } else {
    console.log('🚫 INPUT BLOCKED - CRITICAL THREATS DETECTED\n');
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ PromptGuard API running on http://localhost:${PORT}`);
  console.log('📡 Ready to analyze security threats...\n');
});

module.exports = app;