import { BankChapter, BankChapterSchema } from '../../domain/entities/bank-chapter.types';
import { MathScratchpadDB } from '../scratchpad-db';

export class BankRepository {
  constructor(private db: MathScratchpadDB) {}

  async getBankChapter(chapterId: string): Promise<BankChapter | undefined> {
    return this.db.chapters_bank.get(chapterId);
  }

  async saveBankChapter(chapter: BankChapter): Promise<void> {
    const validated = BankChapterSchema.parse(chapter);
    await this.db.chapters_bank.put(validated);
  }

  async listBankChapters(): Promise<BankChapter[]> {
    return this.db.chapters_bank.toArray();
  }

  async deleteBankChapter(chapterId: string): Promise<void> {
    await this.db.chapters_bank.delete(chapterId);
  }
}
