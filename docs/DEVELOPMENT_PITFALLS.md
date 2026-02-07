# Development Pitfalls & Solutions

This document records common pitfalls encountered during development and their solutions. **Read this before starting any new feature development.**

---

## TypeScript Type Issues

### 1. Union Type Property Access

**Problem:** Accessing properties that only exist on some members of a union type.

```typescript
// ERROR: Property 'muted' does not exist on type 'TimelineTrack'
const isMuted = track.muted;
```

**Solution:** Use type guards before accessing type-specific properties.

```typescript
import { canTracktHaveAudio, canTrackBeHidden } from '@/lib/timeline';

// Correct: Use type guard
const isMuted = track && canTracktHaveAudio(track) ? track.muted : false;
const isHidden = track && canTrackBeHidden(track) ? track.hidden : false;
```

**Files affected:** `timeline-tools.ts`, any code dealing with `TimelineTrack`, `TimelineElement` unions.

---

### 2. Transcription Type Assertions

**Problem:** String parameters need to be cast to specific literal types after validation.

```typescript
// ERROR: Type 'string' is not assignable to type 'TranscriptionLanguage'
transcriptionService.transcribe({ language: languageParam });
```

**Solution:** After validating the value, use type assertion.

```typescript
import type { LanguageCode } from '@/types/language';
import type { TranscriptionModelId } from '@/types/transcription';

// After validation passes:
language: languageParam === 'auto' ? undefined : (languageParam as LanguageCode),
modelId: modelId as TranscriptionModelId,
```

---

### 3. Transform Type Construction

**Problem:** Spread operators with conditional properties cause type inference issues.

```typescript
// ERROR: Type '{ position: { y: {} | null; x: {} | null; }; ... }' not assignable to 'Transform'
updates.transform = nextTransform;
```

**Solution:** Explicitly construct the object with correct types after validation.

```typescript
// After validation, explicitly construct:
updates.transform = {
  scale: nextTransform.scale as number,
  rotate: nextTransform.rotate as number,
  position: {
    x: nextTransform.position.x as number,
    y: nextTransform.position.y as number,
  },
};
```

---

### 4. Function Return Type Union Access

**Problem:** Functions like `buildTextElement` return a union type, blocking access to specific properties.

```typescript
// ERROR: Property 'content' does not exist on type 'CreateTimelineElement'
const element = buildTextElement({ raw, startTime });
data: { content: element.content }  // Error!
```

**Solution:** Use type assertion for known return types.

```typescript
content: (element as { content?: string }).content,
```

---

## Testing Issues

### 5. Mock State Pollution Between Tests

**Problem:** `mockReturnValue` or `mockImplementation` persists across tests; `vi.clearAllMocks()` only clears call history, not implementations.

```typescript
// Test A sets this - affects all subsequent tests!
editor.timeline.getTracks.mockReturnValue([customData]);
```

**Solution:** Reset mock implementations in `beforeEach`.

```typescript
beforeEach(async () => {
  vi.clearAllMocks();
  tracksState = buildTracksState();

  // IMPORTANT: Reset mock implementations
  const { EditorCore } = await import('@/core');
  const editor = EditorCore.getInstance();
  editor.timeline.getTracks.mockImplementation(() => tracksState);
});
```

---

### 6. mockReturnValueOnce vs mockReturnValue

**Problem:** Tool functions may call the same mock multiple times; `mockReturnValueOnce` only works once.

```typescript
// Only returns testData on first call!
editor.timeline.getTracks.mockReturnValueOnce(testData);
// Second call returns default/undefined
```

**Solution:** Use `mockImplementation` for multi-call scenarios.

```typescript
// Works for all calls within this test
editor.timeline.getTracks.mockImplementation(() => testData);
```

---

### 7. Test Expectations vs Mock Data Mismatch

**Problem:** Adding new mock data (e.g., new tracks for caption tests) breaks existing test expectations.

```typescript
// Mock has 3 tracks, 4 elements after adding text track for captions
// But old test expects 2 tracks, 3 elements
expect(result.data).toMatchObject({ trackCount: 2 });  // FAIL
```

**Solution:** Update test expectations when mock data changes.

```typescript
// Update to match current mock state
expect(result.data).toMatchObject({ trackCount: 3, totalElements: 4 });
```

---

## Lint Issues

### 8. let vs const

**Problem:** Using `let` for variables that are never reassigned.

```typescript
// WARNING: This let declares a variable that is only assigned once
let allowedElements = new Set<string>();
```

**Solution:** Use `const` for variables that won't be reassigned.

```typescript
const allowedElements = new Set<string>();
```

---

### 8. Test Mocks Not Updated After Tool Refactors

**Problem:** When a tool is refactored to use different EditorCore methods (e.g., `splitElements` → pure functions + `replaceTracks`), the integration test mock and assertions still reference the old API. The missing mock method causes a TypeError, caught silently by the tool's catch block, returning `{success: false}`.

```typescript
// Tool was refactored from:
editor.timeline.splitElements(...)
// To:
const result = splitTracksAtTime({ tracks, ... }); // pure function
editor.timeline.replaceTracks({ tracks: result.tracks }); // new API

// But mock still has:
timeline: { splitElements: vi.fn(), /* no replaceTracks! */ }
// → TypeError: editor.timeline.replaceTracks is not a function
// → caught by try/catch → success: false
```

**Solution:** When refactoring tool internals, always update:
1. The mock in `integration-harness.ts` — add new methods, keep old ones for other tests
2. The test assertions — verify the new method is called, not the old one
3. The type cast in the test — update the type to match new methods

```typescript
// integration-harness.ts
timeline: {
  splitElements: vi.fn(),
  replaceTracks: vi.fn(), // add new method
  // ...
}

// test file
const editor = EditorCore.getInstance() as unknown as {
  timeline: { replaceTracks: ReturnType<typeof vi.fn>; /* ... */ };
};
expect(editor.timeline.replaceTracks).toHaveBeenCalled();
```

**Files affected:** `integration-harness.ts`, `integration-registry-*.ts`

---

## Architecture Principles

### 9. Fork Management - Minimal Intrusion

**Problem:** Modifying upstream code makes syncing difficult and creates merge conflicts.

**Solution:** Follow the wrapper/decorator pattern:

1. **Never modify upstream files** - create wrappers instead
2. **Decoupled directories:** `src/agent/`, custom components
3. **Single injection point:** Only one line change in upstream (e.g., `page.tsx`)
4. **Command pattern:** Add new Commands in `lib/commands/` without modifying managers

```
Good:
- src/agent/tools/timeline-tools.ts (new file)
- src/lib/commands/timeline/element/update-element-transform.ts (new file)

Bad:
- Modifying src/core/timeline-manager.ts directly
```

---

## Checklist Before PR

- [ ] Run `bunx biome lint src/agent --max-diagnostics=1000`
- [ ] Run `bun run build`
- [ ] Run `bun run test`
- [ ] Check for type guard usage on union types
- [ ] Verify test mock state is properly reset in `beforeEach`
- [ ] Update test expectations if mock data changed
- [ ] New features follow minimal intrusion principle

---

## Adding New Pitfalls

When you encounter a new pitfall:

1. Document the **Problem** with error message
2. Provide the **Solution** with code example
3. Note **Files affected** if applicable
4. Add to the appropriate section above
5. Update the checklist if needed
