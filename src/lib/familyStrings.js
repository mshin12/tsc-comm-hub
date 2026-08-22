// Hand-rolled string dictionary for the family-facing pages
// (FamilyView.jsx, FamilySession.jsx), covering exactly the ~40 strings
// those two pages actually use. Deliberately not an i18n library
// (i18next etc.) — this app has no i18n infrastructure today, and pulling
// one in for a bounded set of strings on two pages would be more machinery
// than the problem needs (see CLAUDE.md Known Issues #13, which reserved a
// real i18n library for the much bigger "every page, any language" version
// of this problem — not what's being built here).
//
// Korean strings use the polite-but-warm 해요체 register throughout, not
// the more formal 합쇼체 or casual 반말 — appropriate for a family-facing
// support app. Translated by Claude, not a native speaker — worth a native
// speaker or Korean-speaking staff review before this reaches real
// families, the same way any other family-facing copy would be reviewed.

const STRINGS = {
  en: {
    journeyTitle: "{name}'s Communication Journey",
    startPracticing: 'Start Practicing →',
    noLinkedIndividual: 'Could not find a linked individual for your account.',
    couldNotLoadHistory: 'Could not load session history.',
    currentGoals: 'Current Goals',
    goalsPending: 'Goals will be added by the program team soon.',
    sessionHistory: 'Session History',
    noSessionsYet: 'Sessions will appear here after your first visit.',
    scenarioLabel: 'Scenario: ',
    summaryPending: 'A summary for this session will be added soon.',
    languageLabel: 'Language',

    backToOverview: '← Back to Overview',
    practiceWith: 'Practice with {name}',
    couldNotDetermineTier: "Could not determine your linked individual's communication tier. Contact your administrator.",
    couldNotLoadActivities: 'Could not load practice activities.',
    couldNotGenerateSummary: 'Could not generate a summary.',
    generatedButNotSaved: 'Generated a summary but could not save it.',
    couldNotGenerateSessionSummary: 'Could not generate a summary for this session.',
    couldNotStartActivity: 'Could not start the activity. Please try again.',
    assistantNoResponse: 'The assistant could not respond. Please try again.',
    unexpectedResponse: 'Received an unexpected response from the server. Please try again.',
    somethingWentWrong: 'Something went wrong. Please try again.',
    noLinkedIndividualFallback: 'Could not find a linked individual.',
    noActivitiesYet: 'No practice activities are available yet. Please check back soon.',
    chooseActivity: 'Choose an activity to practice together:',
    starting: 'Starting…',
    gettingReady: 'Getting things ready…',
    thinking: 'Thinking...',
    retry: 'Retry',
    typeOrMic: 'Type here, or use the mic…',
    stopListening: 'Stop listening',
    speakMessage: 'Speak your message',
    listening: '● Listening…',
    send: 'Send',
    sending: 'Sending...',
    donePracticing: "I'm Done Practicing",
    sessionInProgress: 'Practice session in progress',
    listeningHint: 'You can tap Send anytime — no need to stop the mic first.',
    greatJob: 'Great job!',
    savingSummary: "Saving a summary of today's practice…",
    finishingUp: 'Finishing up…',
    returnToOverview: 'Return to Overview',

    // Live speech coaching (volume meter + opt-in pronunciation check) —
    // added alongside components/VolumeMeter.jsx and
    // components/SpeechCheckPanel.jsx, see CLAUDE.md.
    volumeQuietHint: 'Try speaking a little louder 🔊',
    checkMySpeech: 'Check My Speech',
    checkingSpeech: 'Listening — go ahead and say a sentence…',
    speechCheckError: 'Could not check your speech. Please try again.',
    speechCheckDismiss: 'Got it',
    tipSoundedGreat: 'That sounded clear and confident — nice work!',
    tipSlowerPace: 'Try slowing down just a little — it can make your words easier to follow.',
    tipFinishThoughts: "Try to finish each sentence all the way through — take your time, there's no rush.",
  },
  ko: {
    journeyTitle: '{name}님의 소통 여정',
    startPracticing: '연습 시작하기 →',
    noLinkedIndividual: '계정에 연결된 개인 정보를 찾을 수 없습니다.',
    couldNotLoadHistory: '세션 기록을 불러올 수 없습니다.',
    currentGoals: '현재 목표',
    goalsPending: '프로그램 팀이 곧 목표를 추가할 예정입니다.',
    sessionHistory: '세션 기록',
    noSessionsYet: '첫 방문 후 세션이 여기에 표시됩니다.',
    scenarioLabel: '시나리오: ',
    summaryPending: '이 세션의 요약은 곧 추가될 예정입니다.',
    languageLabel: '언어',

    backToOverview: '← 개요로 돌아가기',
    practiceWith: '{name}님과 연습하기',
    couldNotDetermineTier: '연결된 개인의 의사소통 단계를 확인할 수 없습니다. 관리자에게 문의해 주세요.',
    couldNotLoadActivities: '연습 활동을 불러올 수 없습니다.',
    couldNotGenerateSummary: '요약을 생성할 수 없습니다.',
    generatedButNotSaved: '요약은 생성되었지만 저장할 수 없습니다.',
    couldNotGenerateSessionSummary: '이 세션의 요약을 생성할 수 없습니다.',
    couldNotStartActivity: '활동을 시작할 수 없습니다. 다시 시도해 주세요.',
    assistantNoResponse: '응답을 받지 못했습니다. 다시 시도해 주세요.',
    unexpectedResponse: '서버에서 예기치 않은 응답을 받았습니다. 다시 시도해 주세요.',
    somethingWentWrong: '문제가 발생했습니다. 다시 시도해 주세요.',
    noLinkedIndividualFallback: '연결된 개인을 찾을 수 없습니다.',
    noActivitiesYet: '아직 이용 가능한 연습 활동이 없습니다. 나중에 다시 확인해 주세요.',
    chooseActivity: '함께 연습할 활동을 선택하세요:',
    starting: '시작 중…',
    gettingReady: '준비 중…',
    thinking: '생각 중...',
    retry: '다시 시도',
    typeOrMic: '여기에 입력하거나 마이크를 사용하세요…',
    stopListening: '듣기 중지',
    speakMessage: '말씀해 주세요',
    listening: '● 듣는 중…',
    send: '보내기',
    sending: '보내는 중...',
    donePracticing: '연습 완료',
    sessionInProgress: '연습 세션 진행 중',
    listeningHint: '마이크를 끄지 않아도 언제든 보내기를 누를 수 있어요.',
    greatJob: '잘하셨어요!',
    savingSummary: '오늘의 연습 요약을 저장하는 중…',
    finishingUp: '마무리하는 중…',
    returnToOverview: '개요로 돌아가기',

    volumeQuietHint: '조금 더 크게 말씀해 주세요 🔊',
    checkMySpeech: '내 발음 확인하기',
    checkingSpeech: '듣고 있어요 — 문장을 하나 말씀해 보세요…',
    speechCheckError: '발음을 확인할 수 없습니다. 다시 시도해 주세요.',
    speechCheckDismiss: '확인했어요',
    tipSoundedGreat: '명확하고 자신감 있게 말씀하셨어요 — 잘하셨어요!',
    tipSlowerPace: '조금만 천천히 말해보세요 — 단어를 더 쉽게 알아들을 수 있어요.',
    tipFinishThoughts: '문장을 끝까지 말해보세요 — 서두르지 않아도 괜찮아요.',
  },
};

/**
 * t(language, key, vars) — looks up `key` in the dictionary for
 * `language`, falling back to English if the language or the key itself
 * isn't found (never throws, never renders blank). `vars` does simple
 * `{token}` substitution, e.g. t('ko', 'practiceWith', { name: '지민' }).
 *
 * Note: only the ~40 strings actually used by FamilyView.jsx/
 * FamilySession.jsx are covered here — this is not a general i18n system,
 * see the file header.
 */
function t(language, key, vars) {
  const dict = STRINGS[language] || STRINGS.en;
  let str = dict[key] ?? STRINGS.en[key] ?? key;

  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      str = str.split('{' + name + '}').join(value);
    }
  }

  return str;
}

export { t };
