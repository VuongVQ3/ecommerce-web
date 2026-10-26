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

	/** When the user accepted the terms of use and privacy policy (null for staff who have not accepted an invitation yet). */
	@Column(name = "terms_accepted_at")
	private Instant termsAcceptedAt;

	/** Staff/admin password below the current rules: the back office is closed until it is changed. */
	@Column(name = "password_change_required", nullable = false)
	private boolean passwordChangeRequired;

	/** Set once the owner proved they read this inbox (email link, or Google Sign-In). */
	@Column(name = "email_verified_at")
	private Instant emailVerifiedAt;

	/** Bumped on any credential change; access tokens carry it so older sessions stop working when it changes. */
	@Column(name = "credential_version", nullable = false)
	private int credentialVersion;

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

	@PreUpdate
	void touch() {
		updatedAt = Instant.now();
	}

	public void linkGoogle(String googleId) {
		this.googleId = googleId;
	}

	/**
	 * The owner of the email (proven by Google) takes over an account whose email was never verified: whoever
	 * registered it may not be them, so the password and phone number they chose are dropped. The phone is the only
	 * delivery detail an account keeps (addresses live on each order).
	 */
	public void clearUnprovenDetails() {
		this.passwordHash = null;
		this.passwordChangeRequired = false;
		this.phone = null;
		this.credentialVersion++;
		this.updatedAt = Instant.now();
	}

	/** {@code passwordHash} must already be encoded. Also gives Google-only accounts a password. */
	public void changePassword(String passwordHash) {
		this.passwordHash = passwordHash;
		this.passwordChangeRequired = false;
		this.credentialVersion++;
		this.updatedAt = Instant.now();
	}

	public void requirePasswordChange() {
		this.passwordChangeRequired = true;
	}

	public boolean isPasswordChangeRequired() {
		return passwordChangeRequired;
	}

	/** Invited staff accept the terms when they set their password. */
	public void acceptTerms(Instant now) {
		if (termsAcceptedAt == null) {
			termsAcceptedAt = now;
		}
	}

	/** A staff account created by an admin: no password until the invitation link is used. */
	public static User invited(String email, String fullName) {
		User user = new User(email, null, fullName, null, null);
		user.role = Role.STAFF;
		return user;
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

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

	public boolean isEmailVerified() {
		return emailVerifiedAt != null;
	}

	public Instant getEmailVerifiedAt() {
		return emailVerifiedAt;
	}

	public int getCredentialVersion() {
		return credentialVersion;
	}

	/** @return true when this call verified it (false if it already was) */
	public boolean markEmailVerified(Instant now) {
		if (emailVerifiedAt != null) {
			return false;
		}
		emailVerifiedAt = now;
		updatedAt = now;
		return true;
	}
}
