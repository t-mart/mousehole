# Mousehole Errors

Mousehole communicates with MyAnonamouse's
[Dynamic Seedbox IP API endpoint](https://www.myanonamouse.net/api/endpoint.php/3/json/dynamicSeedbox.php).
If you see an error in Mousehole, it's just a relay of an error response from
MAM. This page will help you understand what the error means and how to fix it.

## Table of Contents

- [429 Last Change Too Recent](#429-last-change-too-recent)
- [403 Invalid Session](#403-invalid-session)
- [403 Invalid Session - IP Mismatch](#403-invalid-session---ip-mismatch)
- [403 Invalid Session - ASN Mismatch](#403-invalid-session---asn-mismatch)
- [403 Invalid Session - Invalid Cookie](#403-invalid-session---invalid-cookie)
- [403 Incorrect Session Type - Not Allowed This Function](#403-incorrect-session-type---not-allowed-this-function)
- [403 Incorrect Session Type - Non-API Session](#403-incorrect-session-type---non-api-session)

## 429 Last Change Too Recent

**❓ What's wrong?**: MAM was updated within the last hour — either because your
IP changed or because you set a new cookie — and MAM enforces a minimum one-hour
interval between updates.

**🔧 How to fix**: You just have to wait it out, at most one hour. This is a
policy of MAM. Mousehole will retry automatically. You do not need a new cookie
or to restart Mousehole.

## 403 Invalid Session

**❓ What's wrong?**: MAM could not validate the session. This is a general
error, usually returned when a more specific error could not be identified.

**🔧 How to fix**: Get a new cookie value following the steps in
[Getting Your Cookie Value](getting-your-cookie.md).

## 403 Invalid Session - IP Mismatch

**❓ What's wrong?**: The session cookie is locked to a single IP address, and
Mousehole is not running from that IP. This happens when the session was created
with "IP locked".

**🔧 How to fix**: [Create a new session](getting-your-cookie.md) with **ASN**
selected for "IP vs ASN locked session".

## 403 Invalid Session - ASN Mismatch

**❓ What's wrong?**: Mousehole is running on a network that MAM does not
expect. The ASN (Autonomous System Number, which groups sets of IP addresses) of
Mousehole's IP is not in the list of allowed ASNs for the session.

**🔧 How to fix**: Add Mousehole's IP address to the session's allowed ASNs:

1. Copy the IP address shown on Mousehole's main page.

   ![Mousehole ASN Mismatch Error](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/images/asn-mismatch-ip.png)

2. Go to the
   [MAM Security Settings page](https://www.myanonamouse.net/preferences/index.php?view=security).

3. Find your existing Mousehole session in the table and click the "Manage
   Session" button.

   ![MAM Session Table](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/images/manage-session.png)

4. In the popup, add the **Mousehole IP address** to the "Add additional ASN via
   IP address" text box.

   ![MAM Add ASN via IP](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/images/manage-session-modal.png)

   (Ensure "Yes" is selected for "Allow Session to set Dynamic Seedbox".)

   Then press the "Update the session" button.

5. Back in Mousehole, press the "Check Now" button.

   ![Mousehole Check Now Button](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/images/check-now-button.png)

6. You should now see an OK status.

## 403 Invalid Session - Invalid Cookie

**❓ What's wrong?**: The cookie value stored in Mousehole is incorrect —
possibly a typo or a copy of the wrong value.

**🔧 How to fix**: Get a new cookie value following the steps in
[Getting Your Cookie Value](getting-your-cookie.md). When pasting the cookie
value into Mousehole, ensure there are no extra spaces at the beginning or end
of the value.

## 403 Incorrect Session Type - Not Allowed This Function

**❓ What's wrong?**: The session cookie belongs to a session that was not
created with permission to set the Dynamic Seedbox IP. This means "Allow Session
to set Dynamic Seedbox" was set to "No" when the session was created.

**🔧 How to fix**: Get a new cookie value following the steps in
[Getting Your Cookie Value](getting-your-cookie.md), ensuring to select "Yes"
for "Allow Session to set Dynamic Seedbox" when creating the session.

## 403 Incorrect Session Type - Non-API Session

**❓ What's wrong?**: The cookie belongs to a regular MAM web browser session,
not an API session. (Did you copy the cookie from your browser's developer
tools? 🤨)

**🔧 How to fix**: Create a new session the right way by following the steps in
[Getting Your Cookie Value](getting-your-cookie.md).
