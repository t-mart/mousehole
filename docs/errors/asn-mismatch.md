# "Invalid session - ASN mismatch"

If you see "Invalid session - ASN mismatch", then that means that Mousehole is
running on a network that MAM does not expect.

To proceed, get two pieces of information:

1. The IP address that Mousehole is using (shown in the web UI):

   ![Mousehole ASN Mismatch Error](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/images/asn-mismatch-ip.png)

2. Your home IP address (for example, by visiting <https://api.ipify.org/>).

Compare the two IP addresses:

- **If the Mousehole IP and your home IP are different** or **If you are not using a VPN**

  You just need to tell MAM about this new IP address:

  1. Go to the
     [MAM Security Settings page](https://www.myanonamouse.net/preferences/index.php?view=security).

  2. Find your existing Mousehole session in the table and click the "Manage
     Session" button.

     ![MAM Session Table](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/images/manage-session.png)

  3. In the popup, add the **Mousehole IP address** to the "Add additional ASN
     via IP address" text box.

     ![MAM Add ASN via IP](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/images/manage-session-modal.png)

     (Ensure "Yes" is selected for "Allow Session to set Dynamic Seedbox".)

     Then, press the "Update the session" button.

  4. Back in Mousehole, press the "Check Now" button.

     ![Mousehole Check Now Button](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/images/check-now-button.png)

  5. You should now see an OK status.

- **If the Mousehole IP and your home IP are the same and you intend to use a VPN**

  If you're intending to use a VPN, then you have misconfigured the network in
  which Mousehole is running. See the
  [Running the service](https://github.com/t-mart/mousehole/blob/master/README.md#running-the-service)
  section for help.
