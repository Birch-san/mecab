import { tokenize } from '../web_modules/wanakana.js';
import { toSubtokensWithKanjiReadings, toMecabTokens, withWhitespacesSplicedBackIn, withInterWordWhitespaces } from './tokenizer/index.js';
import { kanjidic2Lookup } from './kanjidic2/index.js';
import { edictLookup, getSearchTerm } from './edict2/index.js';

import { createElement, render } from '../web_modules/preact.js';
import { useState, useEffect } from '../web_modules/preact/hooks.js';

import { Provider, connect, createStore } from '../web_modules/unistore/full/preact.es.js';

import htm from '../web_modules/htm.js';
const html = htm.bind(createElement);

function initStore() {
  const store = createStore({
    ready: false,
    mecabCallbacks: {},
    mecabStructures: {},
    parse: undefined,
    kanjidic2Lookup: undefined,
    dictionaryLoading: {
      edict2: false,
      enamdict: false,
      kanjidic2: false,
    },
    dictionaryText: {
      edict2: '',
      enamdict: '',
      kanjidic2: '',
    },
    initialQuery: `太郎はこの本を二郎を見た女性に渡した。
すもももももももものうち。`,
    parses: [],
    // chosenTerm: undefined,
    termResults: {
      key: undefined,
      value: undefined,
    },
  });
  const boundActions = getBoundActions(store);
  return [store, boundActions];
}

const actions = (store) => ({
  setReady(state, ready) {
    return { ...state, ready, };
  },
  addParse(state, parsedQuery) {
    return { ...state, parses: [...state.parses, parsedQuery], };
  },
  setupMecab(state, mecabCallbacks, mecabStructures) {
    return {
      ...state,
      mecabCallbacks,
      mecabStructures,
      parse: bindParser(
        mecabCallbacks,
        mecabStructures),
      ready: !!state.kanjidic2Lookup,
    }
  },
  setDictionaryLoading(state, dict, bool) {
    return {
      ...state,
      dictionaryLoading: {
        ...state.dictionaryLoading,
        [dict]: bool,
      }
    };
  },
  dictionaryLoaded(state, dict, text) {
    let ready = state.ready;
    let kanjidic2LookupFunc = state.kanjidic2Lookup;
    if (dict === 'kanjidic2'
      && !state.kanjidic2Lookup) {
      kanjidic2LookupFunc = kanjidic2Lookup.bind(null, text);
      ready = !!state.parse;
    }
    return {
      ...state,
      ready,
      kanjidic2Lookup: kanjidic2LookupFunc,
      dictionaryLoading: {
        ...state.dictionaryLoading,
        [dict]: false,
      },
      dictionaryText: {
        ...state.dictionaryText,
        [dict]: text,
      },
    };
  },
  // setChosenTerm(state, chosenTerm) {
  //   return { ...state, chosenTerm, };
  // },
  chooseTerm(state, mecabToken) {
    const {edict2, enamdict} = state.dictionaryText;
    if (!edict2 || !enamdict || !state.kanjidic2Lookup) {
      return state;
    }
    let subtokens = mecabToken.subtokens
    if (!mecabToken.subtokens) {
      if (mecabToken.readingHiragana) {
        subtokens = toSubtokensWithKanjiReadings(
          state.kanjidic2Lookup,
          mecabToken.token,
          mecabToken.readingHiragana);
      } else {
        subtokens = tokenize(mecabToken.token, { detailed: true });
      }
    }
    const standardizedToken = {
      ...mecabToken,
      subtokens,
    }
    if (getTermKey(standardizedToken) === getTermKey(state.termResults.key || {})) {
      return state;
    }

    const results = edictLookup(
      [
      edict2,
      enamdict,
      state.kanjidic2Lookup
      ],
      standardizedToken);
    console.log(results);

    return {
      ...state,
      termResults: {
        key: standardizedToken,
        value: results,
      },
    };
  },
  // setTermResults(state, termResults) {
  //   return { ...state, termResults, };
  // }
});

/** Just a way to check whether we're looking up the same entry twice */
function getTermKey({ token, readingHiragana, dictionaryForm }) {
  return JSON.stringify({
    token,
    readingHiragana,
    dictionaryForm,
  });
}

function act(store, actionsObj, action, ...args) {
  return store.setState(
    actionsObj[action](
      store.getState(),
      ...args));
}

function getBoundActions(store) {
  const actor = act.bind(null, store, actions(store));
  return Object.assign({}, 
    ...Object.keys(actions(store))
      .map(action => ({
        [action]: actor.bind(null, action),
      })),
  )
}

const Rubied = ({ theValue, reading }) => {
  return html`
  <ruby>
    <rb>${theValue}<//>
    <rt>${reading}<//>
  <//>
  `
  };

const Word = ({ classList, mecabToken }) => {
  const {
    token,
    subtokens,
    readingHiragana,
    dictionaryForm
    } = mecabToken;
  const reducedSubtokens = subtokens.reduce(({
    bufferedText,
    output,
  }, subtoken) => {
    if (subtoken.type === 'kanji') {
      // we've hit an alphabet boundary, so flush buffer
      if (bufferedText) {
        output = boundHtmlConcat(output, bufferedText);
        bufferedText = '';
      }
      output = html`
      ${output}<${Rubied} theValue=${subtoken.value} reading=${subtoken.reading} />
      `;
      return {
        bufferedText,
        output,
      }
    }
    return {
      bufferedText: bufferedText + subtoken.value,
      output,
    }
  }, {
    bufferedText: '',
    output: '',
  });

  // flush buffer at word end, because it's a "word boundary"
  let { bufferedText, output } = reducedSubtokens;
  if (bufferedText) {
    output = boundHtmlConcat(output, reducedSubtokens.bufferedText);
  }

  // data-readingHiragana=${readingHiragana}
  // data-dictionaryForm=${dictionaryForm}

  return html`
  <span
  class=${classList || ''}
  data-token=${token}
  data-reading-hiragana=${readingHiragana}
  data-dictionary-form=${dictionaryForm}
  >${output}<//>
  `
  };

/**
 * Returns simpler output for special cases
 * html`${'lol'}${'what'}` = ['lol','what']
 * htmlConcat(html, html`${'lol'}`, html`${'what'}`) = 'lolwhat'
 */
function htmlConcat(html, left, right) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  if (typeof left === 'string' && typeof right === 'string') {
    return left + right;
  }
  return html`${left}${right}`;
}
const boundHtmlConcat = htmlConcat.bind(null, html);

const Definition = connect('termResults,kanjidic2Lookup', actions)(
  ({ termResults,kanjidic2Lookup }) => {
    const renderReadingTuple = (classList, headword, readingTuple) => {
      const mecabTokenLike = {
        token: headword,
        subtokens: readingTuple.subtokens,
      };
      return html`
      <${Word} classList=${classList} mecabToken=${mecabTokenLike} />
      `;
    };

    const renderHeadwordReadingTuple = (classList, headwordReadingTuple) => {
      return html`
      <div class="alt-headword-container">
        ${headwordReadingTuple.readingTuples.map(
          renderReadingTuple.bind(
            null,
            classList,
            headwordReadingTuple.headword))}
      <//>
      `;
    };

    // console.log('rendering results:');
    // console.log(results.value);
    const renderEdictResult = (result) => {
      let headwordReadingTuples = result.result.headwordReadingCombinations;
      let bestHeadwordReadingTuple = result.result.bestHeadwordReadingCombination;
      if (!headwordReadingTuples.length) {
        // probably we got an entry that's entirely phonetic
        // so our headword _is_ the reading (but EDICT avoids duplicating information).
        headwordReadingTuples = result.result.headwords.map((headword) => ({
          headword: headword.form,
          readingTuples: [{
            reading: headword.form,
            subtokens: toSubtokensWithKanjiReadings(
              kanjidic2Lookup,
              headword.form,
              headword.form),
          }],
        }));
      }
      if (!headwordReadingTuples.length) {
        // not supposed to be possible, but I suppose we have nothing to show.
        return '';
      }
      if (!bestHeadwordReadingTuple) {
        // might happen if we got an entry that's entirely phonetic (as above)
        const { headword, readingTuples } = headwordReadingTuples[0];
        if (!readingTuples.length) {
          // we could check the other readingTuples, but this isn't supposed to be possible anyway.
          return '';
        }
        bestHeadwordReadingTuple = {
          headword,
          readingTuple: readingTuples[0],
        };
      }
      // console.log(bestHeadwordReadingTuple)
      // console.log(headwordReadingTuples)
      const remainingTuples = headwordReadingTuples.map((headwordReadingTuple) => ({
        ...headwordReadingTuple,
        readingTuples: headwordReadingTuple.readingTuples.filter(({ reading }) => 
          headwordReadingTuple.headword !== bestHeadwordReadingTuple.headword
          || reading !== bestHeadwordReadingTuple.readingTuple.reading),
      }))
      .filter(({ readingTuples }) => readingTuples.length);
      // console.log(remainingTuples)

      // const mecabTokenLike = {
      //   token: headword,
      //   subtokens: readingTuple.subtokens,
      // };

      return html`
      <div class="hero-container">
        ${renderReadingTuple('hero-definition', bestHeadwordReadingTuple.headword, bestHeadwordReadingTuple.readingTuple)}
        <div>${result.result.meaning}<//>
        <div>${result.result.line}<//>
      <//>
      <div class="alt-container">
        ${remainingTuples.map(renderHeadwordReadingTuple.bind(null, 'alt-definition'))}
      <//>
      `;
    };
    // { headwords, meaning, readings}
    // const renderEnamdictResult = (result) => {
    //   return html`
    //   <pre>${JSON.stringify(result.result, null, '  ')}</pre>
    //   `;
    // };
    const renderEnamdictResult = renderEdictResult;

    const term = getSearchTerm(termResults.key);


    // <h3>EDICT2<//>

    return html`
    <div>
      <div class="results-header">
      Dictionary results for 
        '<${Word} classList="" mecabToken=${termResults.key} />'
        ${termResults.key.dictionaryForm
          && termResults.key.dictionaryForm !== termResults.key.token
          && ` (dictionary form: '${termResults.key.dictionaryForm}')`}
      <//>
      <div class="jisho-lookup">
      Look up <a href=${
      `https://jisho.org/search/${encodeURIComponent(term)}`
      } target="_blank">${term}<//> on Jisho.org
      <//>
      ${termResults.value.edict2.map(renderEdictResult)}
      <div class="names-section">Names<//>
      ${termResults.value.enamdict.map(renderEnamdictResult)}
    <//>
    `;
  });

// if we want this connected to the store, we'll need a workaround
// otherwise the whole list will undergo re-render when any item is added
// https://stackoverflow.com/a/38726478/5257399
const Sentence = ({ nodes, order }) => {
  // console.log('sentence render:');
  // console.log(nodes);
  // const [chosenTerm, setChosenTerm] = useState(undefined);

  const renderNode = (acc, node) => {
    if (node.isWhitespace) {
      return {
        output: boundHtmlConcat(acc.output, node.token),
      };
    }

    return {
      output: html`${acc.output}<${Word} classList="token4" mecabToken=${node} />`,
    };
  };

  return html`
  <div class="output-row" style="${{ order }}">
    <div class="parsed-sentence">
      ${nodes.reduce(renderNode, {
        output: '',
      }).output}
    <//>
  <//>
  `
};

const App = connect('ready,parses,initialQuery,parse,termResults,dictionaryText,kanjidic2Lookup', actions)(
  ({ ready, parses, initialQuery, parse, termResults, dictionaryText, addParse, chooseTerm, kanjidic2Lookup }) => {
    const keyedParses = parses.reduce((acc, parse) => ({
      parses: [...acc.parses, {
        key: acc.nextKey,
        parse,
      }],
      nextKey: acc.nextKey + 1,
    }), {
      parses: [],
      nextKey: 0,
    });

    const [query, setQuery] = useState(initialQuery);

    function onSubmit(event) {
      event.preventDefault();
      const nodes = parse(kanjidic2Lookup, query);
      addParse(nodes);
    }

    function onClick(event) {
      const {edict2, enamdict, kanjidic2} = dictionaryText;
      if (!edict2 || !enamdict || !kanjidic2) {
        return;
      }
      // console.log(event);
      const tokenNode = event.target.className === 'token4'
      ? event.target
      : event.target.closest('.token4');
      // console.log(tokenNode);
      if (tokenNode) {
        const token = tokenNode.getAttribute('data-token');
        if (token) {
          event.stopPropagation();
          const mecabToken = {
            token,
            readingHiragana: tokenNode.getAttribute('data-reading-hiragana'),
            dictionaryForm: tokenNode.getAttribute('data-dictionary-form'),
          };
          chooseTerm(mecabToken);
        }
      }
    }

    const renderParsedQuery = (item) => html`
      <${Sentence} order=${item.key*2} key=${item.key} nodes=${item.parse} />
    `;

    // console.log('App render');

    return html`
      <form onSubmit=${onSubmit}>
        ${/* btw, we can't use React's onChange; Preact prefers browser-native onInput
        https://github.com/developit/preact/issues/1034 */''}
        <textarea class="input" value=${query} onInput=${event => setQuery(event.target.value)} />
        <button class="submitter" disabled=${!ready}>Analyse Japanese<//>
      <//>
      <div class="paper-tape columnReverse" onClick=${onClick}>
        ${keyedParses.parses.map(renderParsedQuery)}
        ${termResults.key && html`
          <div class="output-row" style="${{ order: keyedParses.parses.length*2-3 }}">
            <${Definition} key=${`Definition ${termResults.key}`} />
          <//>
          `}
      <//>
    `;
  });

function renderApplication(store, element) {
  return render(html`
  <${Provider} store=${store}>
    <${App} />
  <//>
  `, element);
}

const Progress = connect('dictionaryLoading', actions)(
  ({ dictionaryLoading }) => {
    const { edict2, enamdict, kanjidic2 } = dictionaryLoading;
    return html`
    <div>
      ${edict2 && html`
        <div>Downloading embedded dictionary (EDICT2)...<//>
        `}
      ${enamdict && html`
        <div>Downloading embedded dictionary of names (ENAMDICT)...<//>
      `}
      ${kanjidic2 && html`
        <div>Downloading embedded dictionary of kanji (KANJIDIC2)...<//>
      `}
    <//>
    `;
    });

function renderProgress(store, element) {
  return render(html`
  <${Provider} store=${store}>
    <${Progress} />
  <//>
  `, element);
}

function parse({ mecab_sparse_tostr }, { tagger }, kanjidic2Lookup, sentence) {
  const whitespaces = [];
  const r = new RegExp('[\\s　]+', 'g');
  let match;
  while(match = r.exec(sentence)) {
    /*
    0: ' ',
    index: 27,
    */
    whitespaces.push(match);
  }
  const mecabOutput = mecab_sparse_tostr(tagger, sentence);
  console.log(mecabOutput);
  const mecabTokens = toMecabTokens(kanjidic2Lookup, mecabOutput);
  const plusOriginalWhitespaces = withWhitespacesSplicedBackIn(mecabTokens, whitespaces);
  const plusInterWordWhitespaces = withInterWordWhitespaces(plusOriginalWhitespaces);
  return plusInterWordWhitespaces;
}

function bindParser(mecabCallbacks, mecabStructures) {
  return parse.bind(null, mecabCallbacks, mecabStructures);
}

function initApplication({
  dictionaryTextPromises,
  store,
  actions,
  element,
  progressElement,
}) {
  actions.setDictionaryLoading('edict2', true);
  actions.setDictionaryLoading('enamdict', true);
  actions.setDictionaryLoading('kanjidic2', true);
  dictionaryTextPromises.edict2.then((text) => {
    actions.dictionaryLoaded('edict2', text);
  });
  dictionaryTextPromises.enamdict.then((text) => {
    actions.dictionaryLoaded('enamdict', text);
  });
  dictionaryTextPromises.kanjidic2.then((text) => {
    actions.dictionaryLoaded('kanjidic2', text);
  });
  renderApplication(store, element);
  renderProgress(store, progressElement);
}

export {
  initStore,
  initApplication,
};