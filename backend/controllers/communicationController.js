const Communication = require('../models/Communication');
const Lead = require('../models/Lead');
const AuditLog = require('../models/AuditLog');

// Get communication history
exports.getLogs = async (req, res) => {
  try {
    const logs = await Communication.find().sort({ createdAt: -1 }).limit(100);
    return res.status(200).json({ success: true, count: logs.length, logs });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve communication logs.' });
  }
};

// Send / Log WhatsApp Message
exports.sendWhatsApp = async (req, res) => {
  try {
    const { recipient, recipientName, leadId, templateName, message } = req.body;

    if (!recipient || !message) {
      return res.status(400).json({ success: false, message: 'Recipient number and message body required.' });
    }

    const log = await Communication.create({
      channel: 'whatsapp',
      recipient: recipient.replace(/\D/g, ''),
      recipientName: recipientName || 'Parent',
      leadId: leadId || null,
      templateName: templateName || 'Custom Message',
      message,
      status: 'delivered',
      sender: req.user.name
    });

    if (leadId) {
      const lead = await Lead.findById(leadId);
      if (lead) {
        lead.history.push({
          action: 'WHATSAPP_SENT',
          user: req.user.name,
          details: `WhatsApp sent: "${templateName || 'Direct Message'}"`
        });
        await lead.save();
      }
    }

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'CREATE',
      module: 'WhatsApp',
      details: `Dispatched WhatsApp message to ${recipient} (${recipientName})`,
      isSpecialFlag: false
    });

    return res.status(201).json({
      success: true,
      message: 'WhatsApp message dispatched and logged successfully.',
      log
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Send / Log Email
exports.sendEmail = async (req, res) => {
  try {
    const { recipient, recipientName, leadId, subject, message } = req.body;

    if (!recipient || !subject || !message) {
      return res.status(400).json({ success: false, message: 'Recipient email, subject, and message body required.' });
    }

    const log = await Communication.create({
      channel: 'email',
      recipient: recipient.toLowerCase().trim(),
      recipientName: recipientName || 'Parent',
      leadId: leadId || null,
      subject,
      message,
      status: 'delivered',
      sender: req.user.name
    });

    return res.status(201).json({
      success: true,
      message: 'Email dispatched and logged successfully.',
      log
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
