import { cloneDeep, isEmpty } from 'lodash';
import { ClosingPeriodInterface } from '../closing-period/closing-period.interface';
import { Day, getNumberOfDaysBetweenFirstDateAndSecondDate, isFirstDateBeforeSecondDateIgnoringHours, NUMBER_OF_DAYS_IN_A_WEEK } from '../date.utils';
import { Product } from '../product/product';
import { ProductIdWithQuantity, ProductWithQuantity } from '../product/product-with-quantity';
import { ProductInterface } from '../product/product.interface';
import { OrderId } from '../type-aliases';
import { NewOrderCommand } from './commands/new-order-command';
import { UpdateOrderCommand } from './commands/update-order-command';
import { InvalidOrderError } from './errors/invalid-order.error';
import { DELIVERY_DAY, MAXIMUM_DAY_FOR_DELIVERY_SAME_WEEK, MAXIMUM_HOUR_FOR_DELIVERY_SAME_WEEK } from './order-delivery-constraints';
import { AVAILABLE_DAYS_FOR_A_PICK_UP_ORDER, AvailableDayForAPickUpOrder, CLOSING_DAYS } from './order-pick-up-constraints';
import { OrderType } from './order-type';
import { OrderInterface } from './order.interface';

export class Order implements OrderInterface {
  static factory: OrderFactoryInterface = {
    create(command: NewOrderCommand, activeProducts: ProductInterface[], closingPeriods: ClosingPeriodInterface[]): Order {
      return new Order({} as OrderInterface, command, activeProducts, closingPeriods);
    },
    copy(order: OrderInterface): Order {
      return new Order(order, {} as NewOrderCommand, [], []);
    },
  };

  private static EMAIL_REGEX: RegExp = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

  id: OrderId;
  clientName: string;
  clientPhoneNumber: string;
  clientEmailAddress: string;
  products: ProductWithQuantity[];
  type: OrderType;
  pickUpDate?: Date;
  deliveryDate?: Date;
  deliveryAddress?: string;
  note?: string;

  private constructor(order: OrderInterface, command: NewOrderCommand, activeProducts: ProductInterface[], closingPeriods: ClosingPeriodInterface[]) {
    if (!isEmpty(order)) {
      this.copy(order);
    } else {
      this.id = undefined;

      this.bindContactDetails(command);
      this.bindProductSelection(command, activeProducts);
      this.bindOrderTypeSelection(command, closingPeriods);
      Order.assertPickUpDateIsEqualOrAfterTheFirstAvailableDay(command.type, command.pickUpDate);
      this.note = command.note;
    }
  }

  private static assertClientNameIsValid(clientName: string): void {
    if (isEmpty(clientName)) {
      throw new InvalidOrderError('client name has to be defined');
    }
  }

  private static assertClientPhoneNumberIsValid(clientPhoneNumber: string): void {
    if (isEmpty(clientPhoneNumber)) {
      throw new InvalidOrderError('client phone number has to be defined');
    }
  }

  private static assertClientEmailAddressIsValid(clientEmailAddress: string): void {
    if (isEmpty(clientEmailAddress)) {
      throw new InvalidOrderError('client email address has to be defined');
    }
    if (!this.EMAIL_REGEX.test(clientEmailAddress)) {
      throw new InvalidOrderError('invalid client email address');
    }
  }

  private static assertTypeIsValid(type: OrderType): void {
    if (isEmpty(type)) {
      throw new InvalidOrderError('order type has to be defined');
    }
    if (!Object.keys(OrderType).includes(type)) {
      throw new InvalidOrderError('unknown order type');
    }
  }

  private static assertProductsAreValid(products: ProductIdWithQuantity[]): void {
    if (isEmpty(products)) {
      throw new InvalidOrderError('an order must have at least one product');
    }

    const numberOfProductsHavingANegativeOrZeroQuantity: number = products.filter(
      (productWithQuantity: ProductIdWithQuantity) => productWithQuantity.quantity < 1
    ).length;
    if (numberOfProductsHavingANegativeOrZeroQuantity > 0) {
      throw new InvalidOrderError('a product quantity has to be positive');
    }
  }

  private static assertPickUpDateIsValid(type: OrderType, closingPeriods: ClosingPeriodInterface[], pickUpDate?: Date): void {
    if (type === OrderType.PICK_UP) {
      if (!pickUpDate) {
        throw new InvalidOrderError('a pick-up date has to be defined when order type is pick-up');
      }

      const now: Date = new Date();
      if (isFirstDateBeforeSecondDateIgnoringHours(pickUpDate, now)) {
        throw new InvalidOrderError('pick-up date has to be in the future');
      }

      if (CLOSING_DAYS.includes(pickUpDate.getDay())) {
        throw new InvalidOrderError('pick-up date has to be between a Tuesday and a Saturday');
      }

      closingPeriods.forEach((closingPeriod: ClosingPeriodInterface) => {
        if (pickUpDate.getTime() >= closingPeriod.startDate.getTime() && pickUpDate.getTime() <= closingPeriod.endDate.getTime()) {
          throw new InvalidOrderError('pick-up date has to be outside closing periods');
        }
      });
    }
  }

  private static assertPickUpDateIsEqualOrAfterTheFirstAvailableDay(type: OrderType, pickUpDate: Date): void {
    if (type === OrderType.PICK_UP) {
      const now: Date = new Date();
      const currentDay: number = now.getDay();
      if (currentDay - pickUpDate.getDay() === 0) {
        throw new InvalidOrderError('pick-up date cannot be same day as now');
      }

      const firstAvailableDay: Day = AVAILABLE_DAYS_FOR_A_PICK_UP_ORDER.filter(
        (availableDayForAPickUpOrder: AvailableDayForAPickUpOrder) => availableDayForAPickUpOrder.whenOrderIsPlacedOn === currentDay
      ).map((availableDayForAPickUpOrder: AvailableDayForAPickUpOrder) => availableDayForAPickUpOrder.firstAvailableDay)[0];

      let numberOfDaysBetweenNowAndFirstAvailableDay: number = Math.abs(firstAvailableDay - currentDay);

      const numberOfDaysBetweenNowAndPickUpDate: number = getNumberOfDaysBetweenFirstDateAndSecondDate(now, pickUpDate);
      const isPickUpDateInTheNextSixDays: boolean = numberOfDaysBetweenNowAndPickUpDate < NUMBER_OF_DAYS_IN_A_WEEK;
      const isPickUpDateInTheWeekAfter: boolean = isPickUpDateInTheNextSixDays && pickUpDate.getDay() < currentDay;
      if (isPickUpDateInTheWeekAfter) {
        numberOfDaysBetweenNowAndFirstAvailableDay = NUMBER_OF_DAYS_IN_A_WEEK - numberOfDaysBetweenNowAndFirstAvailableDay;
      }

      if (isFirstDateBeforeSecondDateIgnoringHours(pickUpDate, Order.getCurrentDatePlusDays(numberOfDaysBetweenNowAndFirstAvailableDay))) {
        throw new InvalidOrderError(`pick-up date has to be at least ${numberOfDaysBetweenNowAndFirstAvailableDay} days after now`);
      }
    }
  }

  private static assertDeliveryAddressIsValid(type: OrderType, deliveryAddress?: string): void {
    if (type === OrderType.DELIVERY && isEmpty(deliveryAddress)) {
      throw new InvalidOrderError('a delivery address has to be defined when order type is delivery');
    }
  }

  private static assertDeliveryDateIsValid(type: OrderType, closingPeriods: ClosingPeriodInterface[], deliveryDate?: Date): void {
    if (type === OrderType.DELIVERY) {
      if (!deliveryDate) {
        throw new InvalidOrderError('a delivery date has to be defined when order type is delivery');
      }

      const now: Date = new Date();
      if (deliveryDate.getTime() < now.getTime()) {
        throw new InvalidOrderError('delivery date has to be in the future');
      }

      closingPeriods.forEach((closingPeriod: ClosingPeriodInterface) => {
        if (deliveryDate.getTime() >= closingPeriod.startDate.getTime() && deliveryDate.getTime() <= closingPeriod.endDate.getTime()) {
          throw new InvalidOrderError('delivery date has to be outside closing periods');
        }
      });

      if (deliveryDate.getDay() !== DELIVERY_DAY) {
        throw new InvalidOrderError('delivery date has to be a Thursday');
      }

      const numberOfDaysBetweenNowAndDeliveryDate: number = getNumberOfDaysBetweenFirstDateAndSecondDate(now, deliveryDate);
      const isDeliveryDateIsInTheNextSixDays: boolean = numberOfDaysBetweenNowAndDeliveryDate < NUMBER_OF_DAYS_IN_A_WEEK;
      if (
        isDeliveryDateIsInTheNextSixDays &&
        (now.getDay() > MAXIMUM_DAY_FOR_DELIVERY_SAME_WEEK ||
          (now.getDay() === MAXIMUM_DAY_FOR_DELIVERY_SAME_WEEK && now.getHours() >= MAXIMUM_HOUR_FOR_DELIVERY_SAME_WEEK))
      ) {
        throw new InvalidOrderError('delivery date has to be one of the next available Thursday');
      }
    }
  }

  private static toProductWithQuantity(productIdWithQuantity: ProductIdWithQuantity, activeProducts: ProductInterface[]): ProductWithQuantity {
    const foundProduct: ProductInterface | undefined = activeProducts.find((product: Product) => product.id === productIdWithQuantity.productId);
    if (!foundProduct) {
      throw new InvalidOrderError(`product with id ${productIdWithQuantity.productId} not found`);
    }

    return { product: foundProduct, quantity: productIdWithQuantity.quantity } as ProductWithQuantity;
  }

  private static getCurrentDatePlusDays(numberOfDaysToAdd: number): Date {
    const date: Date = new Date();
    date.setDate(date.getDate() + numberOfDaysToAdd);

    return date;
  }

  updateWith(command: UpdateOrderCommand, activeProducts: ProductInterface[], closingPeriods: ClosingPeriodInterface[]): void {
    if (this.id !== command.orderId) {
      throw new InvalidOrderError('existing order id does not match order id in command');
    }

    this.bindProductSelection(command, activeProducts);
    this.bindOrderTypeSelection(command, closingPeriods);
    this.note = command.note;
  }

  private copy(otherOrder: OrderInterface): void {
    const deepCloneOfOtherOrder: OrderInterface = cloneDeep(otherOrder);
    for (const field in deepCloneOfOtherOrder) {
      if (deepCloneOfOtherOrder.hasOwnProperty(field)) {
        this[field] = deepCloneOfOtherOrder[field];
      }
    }
  }

  private bindContactDetails(command: NewOrderCommand): void {
    Order.assertClientNameIsValid(command.clientName);
    Order.assertClientPhoneNumberIsValid(command.clientPhoneNumber);
    Order.assertClientEmailAddressIsValid(command.clientEmailAddress);

    this.clientName = command.clientName;
    this.clientPhoneNumber = command.clientPhoneNumber;
    this.clientEmailAddress = command.clientEmailAddress;
  }

  private bindProductSelection(command: NewOrderCommand | UpdateOrderCommand, activeProducts: ProductInterface[]): void {
    Order.assertProductsAreValid(command.products);

    this.products = command.products.map((productIdWithQuantity: ProductIdWithQuantity) =>
      Order.toProductWithQuantity(productIdWithQuantity, activeProducts)
    );
  }

  private bindOrderTypeSelection(command: NewOrderCommand | UpdateOrderCommand, closingPeriods: ClosingPeriodInterface[]): void {
    Order.assertTypeIsValid(command.type);
    Order.assertPickUpDateIsValid(command.type, closingPeriods, command.pickUpDate);
    Order.assertDeliveryDateIsValid(command.type, closingPeriods, command.deliveryDate);
    Order.assertDeliveryAddressIsValid(command.type, command.deliveryAddress);

    this.type = command.type;
    if (this.type === OrderType.PICK_UP) {
      this.pickUpDate = command.pickUpDate;
      this.deliveryDate = undefined;
      this.deliveryAddress = undefined;
    } else {
      this.pickUpDate = undefined;
      this.deliveryDate = command.deliveryDate;
      this.deliveryAddress = command.deliveryAddress;
    }
  }
}

export interface OrderFactoryInterface {
  create(command: NewOrderCommand, activeProducts: ProductInterface[], closingPeriods: ClosingPeriodInterface[]): Order;
  copy(order: OrderInterface): Order;
}
