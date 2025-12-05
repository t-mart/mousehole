# Getting Your Cookie Value

When running this service for the first time (or if the cookie gets out of
sync), you need to set the Mousehole's cookie manually. Follow these steps to
get yours.

1. Go to the
   [MAM Security Settings page](https://www.myanonamouse.net/preferences/index.php?view=security).

2. Make a session.

   _(If you already have a session you want to use here, click "View ASN locked
   session cookie" and proceed to the next step.)_

   In the "Create session" section, enter these values:

   ![Create Session Form](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/images/mam-session-form.png)

   | Field                                | Description                                                                  |
   | ------------------------------------ | -----------------------------------------------------------------------------|
   | IP                                   | The current IP address of your host. (Mousehole displays this for you!)      |
   | IP vs ASN locked session             | Select **ASN**. This allows your IP to change.                               |
   | Allow Session to set Dynamic Seedbox | Select **Yes**. This allows the service to update your IP through MAM's API. |
   | Session Label/note                   | Something that identifies the seedbox host, such as "mousehole".             |

   Then press the "Submit Changes!" button.

3. Copy the cookie value on the shown page.

   ![Session Cookie Value](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/images/mam-cookie.png)

4. Back in Mousehole, paste the cookie into the text box and click the "Set" button.

   ![Mousehole Set Button](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/images/cookie-form.png)

5. Click the "Check Now" button.

   ![Mousehole Check Now Button](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/images/check-now-button.png)

6. Et voilà! You should now see an OK status, and Mousehole keep your IP updated
   with MAM automatically in the background. You don't need to do anything else!
   You can close the page.

   If you do not see an OK status, check out
   [how to handle errors](https://github.com/t-mart/mousehole/blob/master/README.md#handling-errors).
