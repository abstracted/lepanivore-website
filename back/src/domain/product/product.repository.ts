import { ProductId } from '../type-aliases';
import { ProductStatus } from './product-status';
import { ProductInterface } from './product.interface';

export interface ProductRepository {
  save(product: ProductInterface): Promise<ProductId>;
  findById(productId: ProductId): Promise<ProductInterface>;
  findAllByStatus(status: ProductStatus): Promise<ProductInterface[]>;
}
