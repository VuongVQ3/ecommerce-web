package com.nutshop.user;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

	/** {@code email} must already be lower-cased. */
	Optional<User> findByEmail(String email);

	boolean existsByEmail(String email);

	boolean existsByPhone(String phone);

	Optional<User> findByGoogleId(String googleId);
}
