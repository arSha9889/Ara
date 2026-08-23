import { legalDocumentUrls } from '../src/features/auth/legalDocuments';

describe('legal document URLs', () => {
  it('points to the published HTTPS legal pages of the AraChat website', () => {
    expect(legalDocumentUrls).toEqual({
      privacy: 'https://aramsg.ru/privacy',
      terms: 'https://aramsg.ru/terms',
    });
  });
});
