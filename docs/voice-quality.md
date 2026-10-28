# Interview voice quality policy

The interview voice list is a curated shortlist, not every voice exposed by the operating system. It contains at most ten browser voice candidates per language and only Marin/Cedar for OpenAI. No number of names or locale labels proves that a synthesized voice is indistinguishable from a person; previews remain the way to judge a particular engine.

## Evidence and limits

- OpenAI explicitly recommends **Marin** and **Cedar** for best quality and notes its voices are optimized for English: https://developers.openai.com/api/docs/guides/text-to-speech
- Apple documents adding and sampling speech voices, regional/language choices, and waiting for downloads to complete: https://support.apple.com/guide/mac-help/change-the-voice-your-mac-uses-to-speak-text-mchlp2290/mac
- Google Cloud documents Chirp 3 HD as a generative speech family and lists Vietnamese support: https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd
- Microsoft lists Vietnamese neural voices HoaiMy/NamMinh in its language support catalogue: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=text-to-speech

There is no universal independent top-ten ranking in these sources. The application uses conservative engine metadata to filter candidates; it does not claim to have auditioned or scored every installed voice. Cloud speech catalogues are not interchangeable with browser Web Speech voices, and listing a cloud voice in documentation does not make it available in the app.

## Browser filtering and playback

Only language-compatible voices explicitly marked Natural, Neural, Enhanced, or Premium in their name/identifier qualify. Compact/basic and novelty/effect voices are excluded, including bell, robotic, whisper, animal and singing-style effects. Duplicate quality variants are collapsed and the shortlist is capped at ten. Relative ordering is a practical quality-family/locale preference, not a measured global quality ranking.

The same filter applies to actual playback, including saved sessions. A previously saved excluded voice cannot bypass it. Fallback is allowed only to another shortlisted voice in the same language. If no candidate qualifies, playback stops with a clear message; the app does not silently use an inferior or different-language voice. A base Vietnamese voice such as Linh is not enough to satisfy this policy without qualifying engine metadata.

Consistently natural Vietnamese across devices requires an installed qualifying Vietnamese voice or a separately configured neural speech service. The existing browser path cannot synthesize a better voice simply by renaming or reordering the system list. Google/Azure neural services would require separate integration and credentials; they are not enabled by this change.
