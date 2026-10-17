import { describe, expect, it } from 'vitest';
import {
  getLauremCalmFirstInterviewQuestions,
  getLauremCalmSecondInterviewQuestions,
} from '@/lib/laurem-calm-interviews';

describe('calm candidate interviews', () => {
  it('keeps the first interview focused at ten questions', () => {
    expect(getLauremCalmFirstInterviewQuestions('uk')).toHaveLength(10);
    expect(getLauremCalmFirstInterviewQuestions('international')).toHaveLength(10);
  });

  it('keeps the second interview to five questions', () => {
    expect(getLauremCalmSecondInterviewQuestions('uk')).toHaveLength(5);
    expect(getLauremCalmSecondInterviewQuestions('international')).toHaveLength(5);
  });

  it('keeps essential screening areas in the first interview', () => {
    const ids = getLauremCalmFirstInterviewQuestions('uk').map((question) => question.id);
    expect(ids).toEqual(expect.arrayContaining([
      'nurse_about_you',
      'nurse_motivation',
      'nurse_person_centred_care',
      'nurse_deteriorating_patient',
      'nurse_safeguarding',
      'nurse_uk_registration',
      'nurse_uk_right_to_work',
    ]));
  });
});
