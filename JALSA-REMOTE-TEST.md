# JALSA Remote V1 — Preview test

This is a preview-only QR controller for Zanko. It does not provide access to the laptop, operating system, files, or other browser tabs.

## Preview setup

1. Apply `migrations/0005_remote_rooms.sql` to the **jalsa-auth-preview** D1 database only.
2. Deploy the PR's Cloudflare Worker Preview.
3. Sign in to JALSA on the TV/computer and start a Zanko game.
4. The QR panel appears when the board opens. Scan it with the group leader's phone.
5. The first phone to claim the QR session becomes the only controller for that game. No phone login is required.
6. Close the QR panel on the TV to return to the game. The phone can control the current game.

## Phone controls

- Previous: return from the open question to the board without using the tile.
- Next question: pass the open question without points, then open the next available question for the next team; from the board, open the next available question.
- Reveal answer.
- Award points to Team 1 or Team 2.
- Pass without points.
- Pause / resume.

The controller shows team scores and the current question. The answer appears after Reveal.

## Security and lifecycle

- Creating a remote session requires the host to be signed in on the game screen.
- The QR contains a high-entropy, short-lived pairing key. The server stores only its SHA-256 hash.
- The first phone to claim the QR becomes the single controller. Other phones are rejected.
- The phone receives permission only to submit the seven allow-listed game actions and read the current Zanko state.
- Sessions expire after two hours or can be ended from the host's QR panel.
- The feature uses the Preview D1 database; do not apply the migration to Production before explicit release approval.

## Test checklist

- Scan from one phone and confirm it connects.
- Scan the same QR from a second phone and confirm it is rejected.
- Test Next, Previous, Reveal, both award buttons, Pass, Pause, and Resume.
- Confirm scores and question state stay in sync between TV and phone.
- End the remote session and confirm the phone can no longer control the game.
- Confirm Price Guessing and normal account/admin pages are unaffected.
