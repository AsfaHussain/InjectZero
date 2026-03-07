const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');

// Create logs directory if it doesn't exist
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

function logAudit(entry) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    ...entry,
  };

  const logFile = path.join(logDir, `audit_${new Date().toISOString().split('T')[0]}.json`);

  try {
    let logs = [];
    if (fs.existsSync(logFile)) {
      const data = fs.readFileSync(logFile, 'utf8');
      logs = JSON.parse(data);
    }

    logs.push(logEntry);
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error('Logging error:', error);
  }
}

function logSecurityEvent(event, severity, details) {
  const entry = {
    type: 'security_event',
    event,
    severity,
    details,
    timestamp: new Date().toISOString(),
  };

  const logFile = path.join(logDir, 'security_events.json');

  try {
    let logs = [];
    if (fs.existsSync(logFile)) {
      const data = fs.readFileSync(logFile, 'utf8');
      logs = JSON.parse(data);
    }

    logs.push(entry);
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error('Security logging error:', error);
  }
}

function getAuditLog(daysBack = 7) {
  const logs = [];
  const now = new Date();

  for (let i = 0; i < daysBack; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const logFile = path.join(logDir, `audit_${dateStr}.json`);

    if (fs.existsSync(logFile)) {
      const data = fs.readFileSync(logFile, 'utf8');
      logs.push(...JSON.parse(data));
    }
  }

  return logs;
}

module.exports = {
  logAudit,
  logSecurityEvent,
  getAuditLog,
};