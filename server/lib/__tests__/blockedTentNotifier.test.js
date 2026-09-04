/**
 * The dedup logic here is what stands between this feature and a flooded
 * VP inbox, so it gets tested directly.
 */

jest.mock('../mailer', () => ({
  sendMail: jest.fn().mockResolvedValue({ sent: true }),
  DEFAULT_RECIPIENT: 'tenting.kville@gmail.com',
}));

jest.mock('../../models/BlockedTentNotice', () => ({
  findOneAndUpdate: jest.fn(),
  create: jest.fn(),
}));

const { sendMail } = require('../mailer');
const BlockedTentNotice = require('../../models/BlockedTentNotice');
const { notifyIfBlocked } = require('../blockedTentNotifier');

const healthyTent = {
  id: 'rec1',
  order: '12',
  name: 'Cameron Crazies',
  type: 'Black',
  captain: 'jd123',
  members: 'Jane Doe, John Smith',
  netIDs: 'jd123, js456',
  startDate: '2026-01-15',
};

// The real defect from tent 46: two netIDs in one comma-slot.
const brokenTent = { ...healthyTent, netIDs: 'jd123 js456' };

beforeEach(() => {
  jest.clearAllMocks();
  BlockedTentNotice.findOneAndUpdate.mockResolvedValue(null);
  BlockedTentNotice.create.mockResolvedValue({});
});

describe('notifyIfBlocked', () => {
  it('sends nothing for a healthy record', async () => {
    const result = await notifyIfBlocked(healthyTent, 'jd123');
    expect(result).toEqual({ notified: false, reason: 'healthy' });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('emails the VPs the first time a record is seen broken', async () => {
    const result = await notifyIfBlocked(brokenTent, 'jd123');
    expect(result.notified).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('names the exact defect, not just that something is wrong', async () => {
    await notifyIfBlocked(brokenTent, 'jd123');
    const { subject, text } = sendMail.mock.calls[0][0];

    expect(subject).toContain('Tent 12');
    expect(text).toContain('jd123 js456');       // the offending value
    expect(text).toContain('separator');          // and how to fix it
    expect(text).toContain('jd123');              // who hit it
    expect(text).toContain('Cameron Crazies');
  });

  it('stays quiet for the same problem inside the 24h window', async () => {
    // Nothing claimed (recent alert exists) and the unique index rejects the insert.
    BlockedTentNotice.findOneAndUpdate.mockResolvedValue(null);
    BlockedTentNotice.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));

    const result = await notifyIfBlocked(brokenTent, 'jd123');

    expect(result).toEqual({ notified: false, reason: 'already-notified' });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('alerts again once the quiet window has passed', async () => {
    // A stale row was found and successfully claimed.
    BlockedTentNotice.findOneAndUpdate.mockResolvedValue({ _id: 'x' });

    const result = await notifyIfBlocked(brokenTent, 'jd123');

    expect(result.notified).toBe(true);
    expect(BlockedTentNotice.create).not.toHaveBeenCalled();
  });

  it('alerts again when the same tent breaks in a NEW way', async () => {
    await notifyIfBlocked(brokenTent, 'jd123');
    const first = BlockedTentNotice.create.mock.calls[0][0].signature;

    jest.clearAllMocks();
    BlockedTentNotice.findOneAndUpdate.mockResolvedValue(null);
    BlockedTentNotice.create.mockResolvedValue({});

    await notifyIfBlocked({ ...brokenTent, startDate: null }, 'jd123');
    const second = BlockedTentNotice.create.mock.calls[0][0].signature;

    expect(second).not.toBe(first);
    expect(sendMail).toHaveBeenCalled();
  });

  it('reports failure rather than throwing when the mailer fails', async () => {
    sendMail.mockResolvedValue({ sent: false, reason: 'smtp down' });
    const result = await notifyIfBlocked(brokenTent, 'jd123');
    expect(result).toMatchObject({ notified: false, reason: 'smtp down' });
  });

  it('swallows a database failure so a captain\'s page still loads', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    BlockedTentNotice.findOneAndUpdate.mockRejectedValue(new Error('mongo down'));

    await expect(notifyIfBlocked(brokenTent, 'jd123')).resolves.toMatchObject({
      notified: false,
      reason: 'mongo down',
    });

    console.error.mockRestore();
  });
});
