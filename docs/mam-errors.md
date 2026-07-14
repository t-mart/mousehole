# MAM Errors

![Example MAM error](/docs/images/mam-errors-tiled.png)

MyAnonamouse's
[Dynamic Seedbox IP API endpoint](https://www.myanonamouse.net/api/endpoint.php/3/json/dynamicSeedbox.php)
may error in various ways against the cookie value you provide. This page will
help you understand what those errors mean and how to fix them.

- [429 Last Change Too Recent](#429-last-change-too-recent)
- [403 Invalid Session](#403-invalid-session)
- [403 Invalid Session - IP Mismatch](#403-invalid-session---ip-mismatch)
- [403 Invalid Session - ASN Mismatch](#403-invalid-session---asn-mismatch)
- [403 Invalid Session - Invalid Cookie](#403-invalid-session---invalid-cookie)
- [403 Incorrect Session Type - Not Allowed This Function](#403-incorrect-session-type---not-allowed-this-function)
- [403 Incorrect Session Type - Non-API Session](#403-incorrect-session-type---non-api-session)

> [!NOTE]
>
> For errors related to `Host` and `Origin` headers, see the
> [security guide](/docs/security-guide.md). For network errors, see the
> [network troubleshooting guide](/docs/network-troubleshooting.md).

## 429 Last Change Too Recent

**Cause**: MAM was updated within the last hour — either because your IP changed
or because you set a new cookie — and MAM enforces a minimum one-hour interval
between updates.

**Fix**: You just have to wait it out, at most one hour. This is a policy of
MAM. Mousehole will retry automatically. You do not need a new cookie or to
restart Mousehole.

## 403 Invalid Session

**Cause**: MAM could not validate the session. This is a general error, usually
returned when a more specific error could not be identified.

**Fix**: Get a new cookie value following the steps in
[Getting Your Cookie Value](/docs/getting-your-cookie.md).

## 403 Invalid Session - IP Mismatch

**Cause**: The session cookie is locked to a single IP address, and Mousehole is
not running from that IP. This happens when the session was created with "IP
locked".

**Fix**: [Create a new session](/docs/getting-your-cookie.md) with **ASN**
selected for "IP vs ASN locked session".

## 403 Invalid Session - ASN Mismatch

**Cause**: Mousehole is running on an IP that MAM does not expect. MAM expects
that your IP is in a known AS (a block of IP addresses numbered by an ASN). If
your IP is not in the expected AS, MAM will reject the request.

**Fix**: Add Mousehole's IP address to the session's allowed ASNs:

1. Copy the IP address shown on Mousehole's main page.

   ![Mousehole ASN Mismatch Error](/docs/images/asn-mismatch-ip.png)

2. Go to the
   [MAM Security Settings page](https://www.myanonamouse.net/preferences/index.php?view=security).

3. Find your existing Mousehole session in the table and click the "Manage
   Session" button.

   ![MAM Session Table](/docs/images/manage-session.png)

4. In the popup, add the **Mousehole IP address** to the "Add additional ASN via
   IP address" text box.

   ![MAM Add ASN via IP](/docs/images/manage-session-modal.png)

   (Ensure "Yes" is selected for "Allow Session to set Dynamic Seedbox".)

   Then press the "Update the session" button.

5. Back in Mousehole, press the "Update Now" button.

   ![Mousehole Update Now Button](/docs/images/update-now-button.png)

6. You should now see an OK status.

> [!NOTE]
>
> It is normal to have to fix this issue a handful of times if your VPN
> connection is configured for a **geographic area**, such as a particular city.
> VPN operators may have have multiple ASNs in a given area, and therefore you
> may need to add multiple ASNs to your session over time.

## 403 Invalid Session - Invalid Cookie

**Cause**: The cookie value stored in Mousehole is incorrect — possibly a typo
or a copy of the wrong value.

**Fix**: Get a new cookie value following the steps in
[Getting Your Cookie Value](/docs/getting-your-cookie.md). When pasting the
cookie value into Mousehole, ensure there are no extra spaces at the beginning
or end of the value.

## 403 Incorrect Session Type - Not Allowed This Function

**Cause**: The session cookie belongs to a session that was not created with
permission to set the Dynamic Seedbox IP. This means "Allow Session to set
Dynamic Seedbox" was set to "No" when the session was created.

**Fix**: Get a new cookie value following the steps in
[Getting Your Cookie Value](/docs/getting-your-cookie.md), ensuring to select
"Yes" for "Allow Session to set Dynamic Seedbox" when creating the session.

## 403 Incorrect Session Type - Non-API Session

**Cause**: The cookie belongs to a regular MAM web browser session, not an API
session. (Did you copy the cookie from your browser's developer tools? 🤨)

**Fix**: Create a new session the right way by following the steps in
[Getting Your Cookie Value](/docs/getting-your-cookie.md).
