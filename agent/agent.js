const axios = require('axios');
const { generateSmartResponse } = require('./smartLLM');
const crypto = require('crypto');

const PROMPTGUARD_API = process.env.PROMPTGUARD_API || 'http://localhost:3000';

class AIAgent {
  constructor(agentId = 'agent-001') {
    this.agentId = agentId;
    this.conversationHistory = [];
    this.blockedAttempts = 0;
    this.processedHashes = new Set(); // Prevent duplicate logging
  }

  /**
   * Main entry point for processing input
   * Returns structured decision object
   */
  async processInput(userInput, sourceType = 'user') {
    // Generate hash to prevent duplicate processing logs
    const inputHash = crypto.createHash('md5').update(userInput).digest('hex');
    const isDuplicate = this.processedHashes.has(inputHash);
    this.processedHashes.add(inputHash);

    // Only show header for unique inputs
    if (!isDuplicate) {
      this.displayProcessingHeader();
    }

    this.displayRawInput(userInput);

    try {
      const securityAnalysis = await this.checkSecurity(userInput, sourceType);

      // Log the THREE STAGES explicitly
      const decision = this.makeSecurityDecision(securityAnalysis);
      this.logThreeStages(userInput, securityAnalysis, decision);

      // Execute decision
      if (decision.action === 'BLOCK') {
        return this.handleBlockedInput(securityAnalysis);
      }

      return await this.handleSafeInput(securityAnalysis);
    } catch (error) {
      console.error('❌ Security check failed:', error.message);
      return { error: 'Security check failed', blocked: true };
    }
  }

  /**
   * STAGE 1: Log original input received by agent
   */
  displayRawInput(input) {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║          📥 STAGE 1: INPUT RECEIVED BY AGENT              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    console.log(`Length: ${input.length} characters`);
    console.log(`Type: ${this.detectInputType(input)}`);
    console.log(`Encoded: ${Buffer.from(input).toString('base64').substring(0, 50)}...\n`);
    
    console.log('📋 Raw Input (before any processing):');
    this.displayRawString(input);
    console.log();
  }

  /**
   * Display string with visible special characters
   */
  displayRawString(str) {
    // Show visible representation with escape sequences highlighted
    const visibleStr = str
      .replace(/</g, '[<]')
      .replace(/>/g, '[>]')
      .replace(/\|/g, '[|]')
      .replace(/&/g, '[&]')
      .replace(/`/g, '[`]')
      .replace(/\n/g, '[\\n]')
      .replace(/\t/g, '[\\t]');

    console.log(`   "${visibleStr}"`);
    
    // Also show raw bytes for critical characters
    const criticalChars = [];
    if (str.includes('<')) criticalChars.push('HTML_TAGS');
    if (str.includes('|')) criticalChars.push('PIPE');
    if (str.includes('&')) criticalChars.push('AMPERSAND');
    if (str.includes('`')) criticalChars.push('BACKTICK');
    
    if (criticalChars.length > 0) {
      console.log(`   ⚠️  Special chars detected: ${criticalChars.join(', ')}`);
    }
  }

  /**
   * Detect what type of input this is
   */
  detectInputType(input) {
    if (input.includes('<!--') || input.includes('-->')) return 'HTML_COMMENT';
    if (input.includes('javascript:')) return 'JAVASCRIPT_PROTOCOL';
    if (input.match(/^[\s]*[{[].*[}\]][\s]*$/)) return 'JSON_LIKE';
    if (input.includes('<?php') || input.includes('<%')) return 'SERVER_CODE';
    if (input.includes('\n')) return 'MULTILINE';
    return 'TEXT';
  }

  /**
   * Check security via PromptGuard API
   */
  async checkSecurity(content, sourceType) {
    try {
      const response = await axios.post(`${PROMPTGUARD_API}/analyze`, {
        content,
        agent_id: this.agentId,
        source_type: sourceType,
      });

      return response.data;
    } catch (error) {
      console.error('❌ Security API Error:', error.message);
      throw error;
    }
  }

  /**
   * Make decision based on risk level
   */
  makeSecurityDecision(analysis) {
    const action = analysis.risk_level === 'critical' ? 'BLOCK' : 'SANITIZE';
    
    return {
      action,
      riskScore: analysis.risk_score,
      riskLevel: analysis.risk_level,
      threatsDetected: analysis.threats_detected,
      threats: analysis.threats,
    };
  }

  /**
   * CRITICAL: Log all three stages with full visibility
   */
  logThreeStages(originalInput, analysis, decision) {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║              🔍 SECURITY ANALYSIS RESULTS                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Stage 1 Summary
    console.log('STAGE 1: Original Input');
    console.log('─'.repeat(60));
    console.log(`Length: ${originalInput.length} chars`);
    this.displayRawString(originalInput);
    console.log();

    // Threat Detection Results
    console.log('Analysis Results:');
    console.log(`  Risk Level: ${this.getRiskEmoji(analysis.risk_level)} ${analysis.risk_level.toUpperCase()}`);
    console.log(`  Risk Score: ${analysis.risk_score}/100`);
    console.log(`  Threats: ${analysis.threats_detected}`);
    
    if (analysis.threat_details && analysis.threat_details.length > 0) {
      console.log(`\n  Detected Threats:`);
      analysis.threat_details.forEach((threat, idx) => {
        console.log(`    ${idx + 1}. [${threat.severity}] ${threat.type}`);
        console.log(`       Match: "${threat.match}"`);
      });
    }
    console.log();

    // Stage 2: Sanitized Output
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║        📝 STAGE 2: SANITIZED OUTPUT FROM PROMPTGUARD       ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const sanitized = analysis.sanitized_content;
    console.log(`Length: ${sanitized.length} chars (was ${originalInput.length})`);
    console.log(`Change: ${this.calculateChange(originalInput, sanitized)}`);
    console.log(`Status: ${decision.action === 'SANITIZE' ? 'SANITIZED' : 'BLOCKED'}\n`);

    if (decision.action === 'SANITIZE') {
      console.log('🧹 Sanitized Content (what LLM will receive):');
      this.displayRawString(sanitized);
      console.log();

      // Show diff-like comparison
      if (originalInput !== sanitized) {
        this.showDiff(originalInput, sanitized);
      }
    } else {
      console.log('🚫 Content BLOCKED - will not be sent to LLM');
    }
    console.log();
  }

  /**
   * Show what changed between original and sanitized
   */
  showDiff(original, sanitized) {
    console.log('📊 Changes Made:');
    
    // Find redacted sections
    const redactions = sanitized.match(/\[🚨 REDACTED: [^\]]+\]/g) || [];
    
    if (redactions.length > 0) {
      const uniqueRedactions = [...new Set(redactions)];
      uniqueRedactions.forEach(redaction => {
        const threatType = redaction.match(/REDACTED: ([^\]]+)/)[1];
        console.log(`  - Redacted ${threatType}`);
      });
    }

    // Character count change
    const charDiff = sanitized.length - original.length;
    const percentChange = ((charDiff / original.length) * 100).toFixed(2);
    console.log(`  - Total characters: ${original.length} → ${sanitized.length} (${charDiff > 0 ? '+' : ''}${charDiff}, ${percentChange}%)`);
    console.log();
  }

  /**
   * STAGE 3: LLM receives sanitized input and responds
   */
  async handleSafeInput(analysis) {
    const sanitizedInput = analysis.sanitized_content;

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║       🤖 STAGE 3: SENDING TO LLM & GENERATING RESPONSE    ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('✅ Security Check PASSED');
    console.log(`   Risk Level: ${analysis.risk_level.toUpperCase()}`);
    console.log(`   Threats Removed: ${analysis.threats_detected}\n`);

    console.log('📤 Input Sent to LLM:');
    this.displayRawString(sanitizedInput);
    console.log();

    // Generate intelligent response based on sanitized input
    const llmResponse = generateSmartResponse(sanitizedInput, analysis.risk_level);

    console.log('🤖 LLM Response Generated:');
    console.log('─'.repeat(60));
    console.log(llmResponse);
    console.log('─'.repeat(60));
    console.log();

    // Store in history
    this.conversationHistory.push({
      original: analysis.original_content,
      sanitized: sanitizedInput,
      riskLevel: analysis.risk_level,
      response: llmResponse,
      timestamp: new Date().toISOString(),
    });

    return {
      blocked: false,
      sanitizedInput,
      response: llmResponse,
      riskLevel: analysis.risk_level,
      threatsRemoved: analysis.threats_detected,
    };
  }

  /**
   * Handle blocked input - never sent to LLM
   */
  handleBlockedInput(analysis) {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║              🚫 STAGE 3: EXECUTION BLOCKED                 ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`⚠️  Risk Level: ${analysis.risk_level.toUpperCase()}`);
    console.log(`🎯 Critical Threats: ${analysis.threats_detected}`);
    console.log(`📋 Threat Types: ${[...new Set(analysis.threats)].join(', ')}\n`);

    console.log('🛡️  SECURITY DECISION:');
    console.log('   ❌ Input BLOCKED before LLM (zero processing risk)');
    console.log('   ❌ No sanitization attempted (critical severity)');
    console.log('   ❌ LLM NEVER invoked\n');

    this.blockedAttempts++;

    return {
      blocked: true,
      reason: 'Critical security threat detected',
      riskLevel: analysis.risk_level,
      threats: analysis.threats,
      message: '⛔ Your request contains critical security threats and cannot be processed.',
    };
  }

  /**
   * Helper: Calculate character change
   */
  calculateChange(original, sanitized) {
    const diff = sanitized.length - original.length;
    const percent = ((diff / original.length) * 100).toFixed(2);
    return `${diff > 0 ? '+' : ''}${diff} chars (${percent}%)`;
  }

  /**
   * Helper: Risk emoji
   */
  getRiskEmoji(level) {
    const emojis = {
      clean: '✅',
      low: '🟢',
      medium: '🟡',
      high: '🟠',
      critical: '🔴',
    };
    return emojis[level] || '❓';
  }

  /**
   * Helper: Display processing header (only once per unique input)
   */
  displayProcessingHeader() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║      🤖 AI AGENT PROCESSING NEW REQUEST                   ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
  }

  /**
   * Get agent statistics
   */
  getStats() {
    return {
      agentId: this.agentId,
      blockedAttempts: this.blockedAttempts,
      processedRequests: this.conversationHistory.length,
      conversationHistory: this.conversationHistory,
    };
  }
}

module.exports = { AIAgent };