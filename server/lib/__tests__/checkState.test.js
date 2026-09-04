const { isCheckInProgress, setCheckInProgress } = require('../checkState');

describe('checkState', () => {
  afterEach(() => setCheckInProgress(false));

  it('starts idle', () => {
    expect(isCheckInProgress()).toBe(false);
  });

  it('reflects a check starting and ending', () => {
    setCheckInProgress(true);
    expect(isCheckInProgress()).toBe(true);
    setCheckInProgress(false);
    expect(isCheckInProgress()).toBe(false);
  });

  it('coerces truthy and falsy values to booleans', () => {
    setCheckInProgress('yes');
    expect(isCheckInProgress()).toBe(true);
    setCheckInProgress(undefined);
    expect(isCheckInProgress()).toBe(false);
  });
});
