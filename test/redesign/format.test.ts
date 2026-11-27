// LMS redesign wave R1a (product-contract v2 on PIL-322, S4; ux-plan UX-104):
// the one shared date formatter. AT-R1a.4e (formatter half).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dayLabel, relativeDay, showDate } from '../../src/format.ts';

describe('UX-104 western digits and date display (formatter)', () => {
  it('AT-R1a.4e day and month name; the year only when it is not the current UTC year', () => {
    assert.equal(showDate('2026-12-12', 'ar', '2026-11-27'), '12 ديسمبر');
    assert.equal(showDate('2026-12-12', 'en', '2026-11-27'), 'Dec 12');
    assert.equal(showDate('2027-01-01', 'ar', '2026-12-31'), '1 يناير 2027');
    assert.equal(showDate('2027-01-01', 'en', '2026-12-31'), 'Jan 1, 2027');
    assert.equal(showDate('2026-12-31', 'en', '2027-01-01'), 'Dec 31, 2026');
    assert.equal(showDate('2027-01-01', 'en', '2027-01-01'), 'Jan 1');
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    months.forEach((m, i) => assert.equal(showDate(`2026-${String(i + 1).padStart(2, '0')}-05`, 'ar', '2026-06-01'), `5 ${m}`));
  });

  it('AT-R1a.4e today, tomorrow, yesterday (also across the year boundary 2026-12-31 → 2027-01-01)', () => {
    assert.equal(relativeDay('2026-11-27', '2026-11-27'), 'today');
    assert.equal(relativeDay('2026-11-28', '2026-11-27'), 'tomorrow');
    assert.equal(relativeDay('2026-11-26', '2026-11-27'), 'yesterday');
    assert.equal(relativeDay('2026-11-30', '2026-11-27'), null);
    assert.equal(relativeDay('2027-01-01', '2026-12-31'), 'tomorrow');
    assert.equal(relativeDay('2026-12-31', '2027-01-01'), 'yesterday');
    assert.equal(dayLabel('2027-01-01', 'ar', '2026-12-31'), 'غدًا');
    assert.equal(dayLabel('2026-12-31', 'ar', '2027-01-01'), 'أمس');
    assert.equal(dayLabel('2026-11-27', 'ar', '2026-11-27'), 'اليوم');
    assert.equal(dayLabel('2026-11-27', 'en', '2026-11-27'), 'today');
    assert.equal(dayLabel('2027-01-05', 'en', '2026-12-31'), 'Jan 5, 2027');
  });

  it('UX-104 western digits only, never an ISO date', () => {
    for (const lang of ['ar', 'en'] as const) {
      for (const iso of ['2026-01-09', '2026-12-31', '2027-03-15']) {
        const s = showDate(iso, lang, '2026-11-27');
        assert.doesNotMatch(s, /[٠-٩۰-۹]/);
        assert.doesNotMatch(s, /\d{4}-\d{2}-\d{2}/);
      }
    }
  });
});
