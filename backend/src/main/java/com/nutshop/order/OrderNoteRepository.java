package com.nutshop.order;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface OrderNoteRepository extends JpaRepository<OrderNote, UUID> {

	List<OrderNote> findByOrderIdOrderByCreatedAtAsc(UUID orderId);
}
