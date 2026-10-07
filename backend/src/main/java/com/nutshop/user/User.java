package com.nutshop.user;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	/** Always stored lower-case (enforced by a DB check constraint). */
	@Column(nullable = false, unique = true)
	private String email;

	@Column(unique = true)
	private String phone;

	@Column(name = "full_name", nullable = false)
	private String fullName;

	/** Null for accounts that only sign in with Google. */
	@Column(name = "password_hash")
	private String passwordHash;

	@Column(name = "google_id", unique = true)
	private String googleId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private Role role = Role.CUSTOMER;

	@Column(name = "is_active", nullable = false)
	private boolean active = true;

	/** When the user accepted the terms of use and privacy policy. */
	@Column(name = "terms_accepted_at", nullable = false)
	private Instant termsAcceptedAt;

	/** Opt-in for promotional emails; off unless the user ticked the checkbox. */
	@Column(name = "marketing_consent", nullable = false)
	private boolean marketingConsent;

	@Column(name = "marketing_consent_at")
	private Instant marketingConsentAt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt = Instant.now();

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt = Instant.now();

	protected User() {
	}

	/** {@code termsAcceptedAt}: accepting the terms is required to have an account. */
	public User(String email, String passwordHash, String fullName, String phone, Instant termsAcceptedAt) {
		this.email = email;
		this.passwordHash = passwordHash;
		this.fullName = fullName;
		this.phone = phone;
		this.termsAcceptedAt = termsAcceptedAt;
	}

	/** Google sign-up: the sign-in pages state that continuing with Google accepts the terms. */
	public static User fromGoogle(String email, String fullName, String googleId, Instant termsAcceptedAt) {
		User user = new User(email, null, fullName, null, termsAcceptedAt);
		user.googleId = googleId;
		return user;
	}

	public void setMarketingConsent(boolean consent, Instant now) {
		if (consent && !marketingConsent) {
			marketingConsentAt = now;
		}
		else if (!consent) {
			marketingConsentAt = null;
		}
		marketingConsent = consent;
	}

	@PreUpdate
	void touch() {
		updatedAt = Instant.now();
	}

	public void linkGoogle(String googleId) {
		this.googleId = googleId;
	}

	/** {@code passwordHash} must already be encoded. Also gives Google-only accounts a password. */
	public void changePassword(String passwordHash) {
		this.passwordHash = passwordHash;
	}

	public void changeRole(Role role) {
		this.role = role;
	}

	public void setActive(boolean active) {
		this.active = active;
	}

	public boolean hasPassword() {
		return passwordHash != null;
	}

	public UUID getId() {
		return id;
	}

	public String getEmail() {
		return email;
	}

	public String getPhone() {
		return phone;
	}

	public String getFullName() {
		return fullName;
	}

	public String getPasswordHash() {
		return passwordHash;
	}

	public String getGoogleId() {
		return googleId;
	}

	public Role getRole() {
		return role;
	}

	public boolean isActive() {
		return active;
	}

	public Instant getTermsAcceptedAt() {
		return termsAcceptedAt;
	}

	public boolean hasMarketingConsent() {
		return marketingConsent;
	}

	public Instant getMarketingConsentAt() {
		return marketingConsentAt;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}
}
