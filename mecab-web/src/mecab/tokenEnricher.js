export class MecabTokenEnricher {
  constructor({
    wanakana: { toHiragana },
    furiganaFitter,
  }) {
    this._wanakana = { toHiragana, };
    this._furiganaFitter = furiganaFitter;
  }

  _getHiraganaReading(mecabToken) {
    return this._wanakana.toHiragana(mecabToken.reading, { passRomaji: false });
  }

  _getSubtokens(readingHiragana, { surfaceLayerForm, partOfSpeech }) {
    return this._furiganaFitter.fitFurigana(
      surfaceLayerForm,
      readingHiragana,
      partOfSpeech === '名詞' // noun
      && partOfSpeechSubcategory1 === '固有名詞' // if proper noun, treat as name
      );
  }

  _getImprovedToken(mecabToken) {
    const readingHiragana = this._getHiraganaReading(mecabToken);
    return {
      ...mecabToken,
      readingHiragana,
      subtokens: this._getSubtokens(readingHiragana, mecabToken),
    };
  }

  getEnriched(mecabTokens) {
    const improvedTokens = mecabTokens.map(mecabToken => this._getImprovedToken(mecabToken));
    return improvedTokens;
  }
}
