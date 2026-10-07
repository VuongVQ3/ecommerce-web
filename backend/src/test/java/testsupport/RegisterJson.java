package testsupport;

/** Builds POST /api/auth/register bodies with the fields every valid registration needs. */
public final class RegisterJson {

	/** The token Cloudflare's test site keys hand out; accepted by the always-pass test secret. */
	public static final String TURNSTILE_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

	private RegisterJson() {
	}

	public static String of(String fullName, String email, String password) {
		return of(fullName, email, password, null);
	}

	public static String of(String fullName, String email, String password, String phone) {
		return "{\"fullName\":\"" + fullName + "\",\"email\":\"" + email + "\",\"password\":\"" + password + "\""
				+ (phone == null ? "" : ",\"phone\":\"" + phone + "\"")
				+ ",\"acceptTerms\":true,\"turnstileToken\":\"" + TURNSTILE_TEST_TOKEN + "\"}";
	}
}
