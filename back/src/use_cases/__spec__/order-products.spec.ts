import { ClosingPeriodInterface } from '../../domain/closing-period.interface';
import { ClosingPeriodRepository } from '../../domain/closing-period.repository';
import { NewOrderCommand } from '../../domain/commands/new-order-command';
import { FeatureStatus } from '../../domain/feature-status';
import { FeatureInterface } from '../../domain/feature.interface';
import { FeatureRepository } from '../../domain/feature.repository';
import { Order, OrderFactoryInterface } from '../../domain/order';
import { OrderNotification, OrderNotificationFactoryInterface } from '../../domain/order-notification';
import { OrderNotificationRepository } from '../../domain/order-notification.repository';
import { OrderType } from '../../domain/order-type';
import { OrderRepository } from '../../domain/order.repository';
import { Product } from '../../domain/product';
import { ProductOrderingDisabledError } from '../../domain/product-ordering-disabled.error';
import { ProductStatus } from '../../domain/product-status';
import { ProductRepository } from '../../domain/product.repository';
import { OrderId } from '../../domain/type-aliases';
import { OrderProducts } from '../order-products';

describe('uses_cases/OrderProducts', () => {
  let orderProducts: OrderProducts;
  let mockProductRepository: ProductRepository;
  let mockClosingPeriodRepository: ClosingPeriodRepository;
  let mockOrderRepository: OrderRepository;
  let mockOrderNotificationRepository: OrderNotificationRepository;
  let mockFeatureRepository: FeatureRepository;
  let newOrderCommand: NewOrderCommand;

  beforeEach(() => {
    Order.factory = {} as OrderFactoryInterface;
    Order.factory.create = jest.fn();

    OrderNotification.factory = {} as OrderNotificationFactoryInterface;
    OrderNotification.factory.create = jest.fn();

    mockProductRepository = {} as ProductRepository;
    mockProductRepository.findAllByStatus = jest.fn();

    mockClosingPeriodRepository = {} as ClosingPeriodRepository;
    mockClosingPeriodRepository.findAll = jest.fn();

    mockOrderRepository = {} as OrderRepository;
    mockOrderRepository.save = jest.fn();

    mockOrderNotificationRepository = {} as OrderNotificationRepository;
    mockOrderNotificationRepository.send = jest.fn();

    mockFeatureRepository = {} as FeatureRepository;
    mockFeatureRepository.findByName = jest.fn();

    orderProducts = new OrderProducts(
      mockProductRepository,
      mockClosingPeriodRepository,
      mockOrderRepository,
      mockOrderNotificationRepository,
      mockFeatureRepository
    );

    newOrderCommand = {
      clientName: 'John Doe',
      clientPhoneNumber: '514-123-4567',
      clientEmailAddress: 'test@example.org',
      products: [{ productId: 42, quantity: 1 }],
      type: OrderType.DELIVERY,
      deliveryAddress: 'Montréal',
    };

    (mockFeatureRepository.findByName as jest.Mock).mockReturnValue(
      Promise.resolve({ name: 'PRODUCT_ORDERING', status: FeatureStatus.ENABLED } as FeatureInterface)
    );
  });

  describe('execute()', () => {
    it('should search for product ordering feature in order to know its status', async () => {
      // when
      await orderProducts.execute(newOrderCommand);

      // then
      expect(mockFeatureRepository.findByName).toHaveBeenCalledWith('PRODUCT_ORDERING');
    });

    it('should reject with product ordering disabled error when product ordering is disabled', async () => {
      // given
      (mockFeatureRepository.findByName as jest.Mock).mockReturnValue(
        Promise.resolve({ name: 'PRODUCT_ORDERING', status: FeatureStatus.DISABLED } as FeatureInterface)
      );

      // when
      const result: Promise<OrderId> = orderProducts.execute(newOrderCommand);

      // then
      await expect(result).rejects.toThrow(new ProductOrderingDisabledError('Product ordering feature has to be enabled to order products'));
    });

    it('should search for active products', async () => {
      // when
      await orderProducts.execute(newOrderCommand);

      // then
      expect(mockProductRepository.findAllByStatus).toHaveBeenCalledWith(ProductStatus.ACTIVE);
    });

    it('should create new order using given command, all products, and closing periods', async () => {
      // given
      const activeProducts: Product[] = [
        { id: 42, name: 'Product 1' } as Product,
        {
          id: 1337,
          name: 'Product 2',
        } as Product,
      ];
      (mockProductRepository.findAllByStatus as jest.Mock).mockReturnValue(Promise.resolve(activeProducts));

      const closingPeriods: ClosingPeriodInterface[] = [
        { id: 1, startDate: new Date('2019-12-23T12:00:00.000Z'), endDate: new Date('2019-12-28T12:00:00.000Z') },
        { id: 2, startDate: new Date('2020-07-15T12:00:00.000Z'), endDate: new Date('2020-08-15T12:00:00.000Z') },
      ];
      (mockClosingPeriodRepository.findAll as jest.Mock).mockReturnValue(Promise.resolve(closingPeriods));

      // when
      await orderProducts.execute(newOrderCommand);

      // then
      expect(Order.factory.create).toHaveBeenCalledWith(newOrderCommand, activeProducts, closingPeriods);
    });

    it('should save created order using repository', async () => {
      // given
      const createdOrder: Order = { clientName: 'Fake order' } as Order;
      (Order.factory.create as jest.Mock).mockReturnValue(createdOrder);

      // when
      await orderProducts.execute(newOrderCommand);

      // then
      expect(mockOrderRepository.save).toHaveBeenCalledWith(createdOrder);
    });

    it('should create order notification with order details, id, and store email address', async () => {
      // given
      const createdOrder: Order = { clientName: 'Fake order' } as Order;
      (Order.factory.create as jest.Mock).mockReturnValue(createdOrder);

      const savedOrderId: OrderId = 42;
      (mockOrderRepository.save as jest.Mock).mockReturnValue(Promise.resolve(savedOrderId));

      // when
      await orderProducts.execute(newOrderCommand);

      // then
      expect(OrderNotification.factory.create).toHaveBeenCalledWith({ id: 42, clientName: 'Fake order' } as Order);
    });

    it('should send created order notification', async () => {
      // given
      const createdOrderNotification: OrderNotification = { subject: 'New order' } as OrderNotification;
      (OrderNotification.factory.create as jest.Mock).mockReturnValue(createdOrderNotification);

      // when
      await orderProducts.execute(newOrderCommand);

      // then
      expect(mockOrderNotificationRepository.send).toHaveBeenCalledWith(createdOrderNotification);
    });

    it('should return saved order id from repository', async () => {
      // given
      const savedOrderId: OrderId = 42;
      (mockOrderRepository.save as jest.Mock).mockReturnValue(Promise.resolve(savedOrderId));

      // when
      const result: OrderId = await orderProducts.execute(newOrderCommand);

      // then
      expect(result).toBe(savedOrderId);
    });
  });
});
