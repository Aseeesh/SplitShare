# SplitHome: tester guide

SplitHome is a household expense-sharing app. Money is tracked to the cent, everyone
agrees to their share, and the person who is paid confirms receipt.

**App URL:** _(fill in before sending)_
**Best on:** a phone (Chrome or Safari). Use "Add to Home Screen" to try the installed app.

## 1. Joining: how accounts and roles work

There is no separate sign-up form. Everyone signs in with **Google** from the
**Sign in** button (a slide-up sheet). The first sign-in creates the account.

Your role is **per household**, and depends on how you got in:

| How you joined                                                | Your role                                                        |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| You create a household yourself ("Households" > Create)       | **Admin** of that household                                      |
| You open an invite link from an admin                         | The role on the invite (the app currently invites as **Member**) |
| An admin adds you as a tracked person (no account)            | **Member**, managed by that admin                                |
| Role changed later by an admin (Members page > role dropdown) | Admin, Member or Viewer                                          |

There is no "initiator" role. Whoever **creates an expense** is its creator, and
whoever **paid** is the payer; both can be any Member or Admin.

| Can do                                                         | Admin | Member | Viewer |
| -------------------------------------------------------------- | ----- | ------ | ------ |
| View expenses and balances                                     | yes   | yes    | yes    |
| Add expenses, accept own share, record and confirm payments    | yes   | yes    | no     |
| Invite / remove members, change roles, settings, lock expenses | yes   | no     | no     |

A household's only admin cannot leave or be demoted.

## 2. Quick mode (the default for new groups)

New groups skip the "accept your share" step: an expense counts the moment it is
added, like Splitwise. An admin can turn the step back on from the household page
(Settings > "Everyone must accept their share"). Paying someone back still needs the
person who is paid to confirm.

First sign-in lands on a one-screen "Start splitting" card: name the group, tap the
button, then add people. **Invite by email** shows a link you can **Copy** or **Share**
straight away, so you do not depend on email arriving. A pending invite has a
**New link** button if you lose it.

## 3. Test script (needs two people, or two Google accounts)

**Person A (admin)**

1. Tap **Sign in**, continue with Google.
2. Households > create **"Flat 3"**, currency NZD. You are the admin.
3. Members > **Invite by email** (Person B's address). Send B the invite link.
   Also try **Track someone** with a name, for a flatmate with no account.

**Person B** 4. Open the invite link, sign in (the sheet appears), tap **Accept invitation**. You are a Member.

**Person A** 5. Add expense: "Groceries", $90.00, paid by A, split **Equal** between A and B, attach a photo receipt.
Expected: status **Pending acceptance**, B's share **$45.00**.

**Person B** 6. Dashboard shows "Awaiting your action". Accept. Expected: **Accepted**. 7. Record a payment of $45.00 to A. Expected: **Pending confirmation**.

**Person A** 8. Confirm the payment. Expected: expense **Paid**, both balances $0.00. 9. Lock the expense, then try to edit it. Expected: rejected.

## 3. Also worth trying

- Split odd amounts ($100.01 three ways): parts must add up exactly to the total.
- Shares and percentage splits; B rejecting a split (expense becomes **Disputed**).
- Delete or edit an expense: it creates a reversal, history stays visible.
- A Viewer should not see Add expense or payment buttons.
- Landing page: sign-in sheet opens, closes by dragging down, Escape, or "Not now".
- Dark mode, offline banner (turn on airplane mode), pull to refresh.

## 4. Report problems with

Device and browser, what you tapped, what you expected, what happened, a screenshot.
