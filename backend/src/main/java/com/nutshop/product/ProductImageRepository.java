package com.nutshop.product;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface ProductImageRepository extends JpaRepository<ProductImage, UUID> {

	List<ProductImage> findByProductIdOrderByPrimaryDescPositionAsc(Long productId);

	List<ProductImage> findByProductIdInOrderByPrimaryDescPositionAsc(Collection<Long> productIds);

	long countByProductId(Long productId);

	/** Clear the current primary first: the unique partial index allows only one per product. */
	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("UPDATE ProductImage i SET i.primary = false WHERE i.productId = :productId AND i.primary = true")
	int clearPrimary(@Param("productId") Long productId);
}
