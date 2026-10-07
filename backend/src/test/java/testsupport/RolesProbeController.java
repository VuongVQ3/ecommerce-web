package testsupport;

import com.nutshop.security.Roles;
import com.nutshop.user.Role;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Test-only endpoint for checking @Roles. Lives outside com.nutshop so component scanning never picks it up;
 * tests that need it @Import it explicitly.
 */
@RestController
public class RolesProbeController {

	@GetMapping("/api/test/staff-only")
	@Roles({ Role.STAFF, Role.ADMIN })
	public String staffOnly() {
		return "ok";
	}
}
