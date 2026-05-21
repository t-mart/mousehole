# Getting Your Cookie Value

When running this service for the first time (or if run into issues), you need
to create a session for it. Each session is tied to a cookie value.

1. Go to the
   [MAM Security Settings page](https://www.myanonamouse.net/preferences/index.php?view=security).

   Here, you will see a section listing your existing sessions and a section to
   create a new session.

   ![Security Settings Page](/docs/images/security-settings-page.png)

2. Create a session.

   **Already have a session from the last time you did this?** You _can_ reuse
   it, but some settings are permanent and cannot be changed later. I recommend
   to just delete the old one with the "Remove Session" button in the "Sessions"
   section and create a new one.

   In the "Create session" section at the bottom of the page, enter these
   values:

   ![Create Session Form](/docs/images/mam-session-form.png)

   | Field                                | Description                                                                                                                          |
   | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
   | IP                                   | The IP address of the machine running Mousehole — **not** your browser's IP. Mousehole shows you the correct value on its main page. |
   | IP vs ASN locked session             | Select **ASN**. This allows your IP to change.                                                                                       |
   | Allow Session to set Dynamic Seedbox | Select **Yes**. This allows the service to update your IP through MAM's API.                                                         |
   | Session Label/note                   | Text by which you can remember the session, such as "mousehole".                                                                     |

   Then press the "Submit Changes!" button.

3. Copy the cookie value on the shown page.

   ![Session Cookie Value](/docs/images/mam-cookie.png)

   **Do not share this cookie with any other client.** The session rotates the
   cookie value for each request, so any other client sharing this cookie will
   be invalidated the moment Mousehole makes a request (and vice versa).

4. Back in Mousehole, paste the cookie into the text box and click the "Set"
   button.

   ![Mousehole Set Button](/docs/images/cookie-form.png)

5. Click the "Check Now" button.

   ![Mousehole Check Now Button](/docs/images/check-now-button.png)

6. Et voilà! You should now see an OK status, and Mousehole will keep your IP
   updated with MAM automatically in the background. You don't need to do
   anything else! You can close the page.

   If you do not see an OK status, check out
   [how to handle errors](https://github.com/t-mart/mousehole/blob/master/README.md#handling-errors).
