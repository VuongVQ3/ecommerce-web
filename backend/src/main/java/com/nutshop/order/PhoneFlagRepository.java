package com.nutshop.order;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PhoneFlagRepository extends JpaRepository<PhoneFlag, UUID> {

	Optional<PhoneFlag> findByPhone(String phone);

	List<PhoneFlag> findByPhoneIn(Collection<String> phones);

	Page<PhoneFlag> findByPhoneContaining(String phone, Pageable pageable);

	Page<PhoneFlag> findByLevelAndPhoneContaining(PhoneFlag.Level level, String phone, Pageable pageable);
}
