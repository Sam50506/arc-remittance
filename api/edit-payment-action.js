import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.PAYOUT_ADMIN_KEY;
const ADMIN_ADDRESS = (process.env.ADMIN_ADDRESS || '0x9e086e6c07d5108ce40d84e9df1ce43caedd2306').toLowerCase();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers['authorization']?.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.address?.toLowerCase() !== ADMIN_ADDRESS) throw new Error('Unauthorized');
  } catch { return res.status(401).json({ error: 'Unauthorized' }); }

  const { action_id, action, reason } = req.body;
  if (!action_id) return res.status(400).json({ error: 'action_id required' });

  const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { data: row, error: fetchErr } = await supabase.from('admin_payment_actions').select('action').eq('id', action_id).single();
  if (fetchErr || !row) return res.status(404).json({ error: 'Action not found' });

  if (action === 'edit_reason') {
    const { error } = await supabase.from('admin_payment_actions').update({ admin_reason: reason || '' }).eq('id', action_id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  if (action === 'delete') {
    // Only under_review entries are just a log flag with no on-chain effect - a
    // cancel_refund already sent a real refund transaction and can't be undone here.
    if (row.action !== 'under_review') return res.status(400).json({ error: 'Only "under review" entries can be removed - cancel & refund already sent funds on-chain and cannot be reversed.' });
    const { error } = await supabase.from('admin_payment_actions').delete().eq('id', action_id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  return res.status(400).json({ error: 'Invalid action' });
}
