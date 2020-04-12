import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { arrayValueTransformer, DATE_MAX_LENGTH, dateIsoStringValueTransformer, DEFAULT_MAX_LENGTH, ENUM_VALUE_MAX_LENGTH } from './entity.utils';

@Entity({ name: 'order' })
export class OrderEntity {
  @PrimaryGeneratedColumn('increment', { name: 'id' })
  id: number;

  @Column({ name: 'client_name', type: 'varchar', nullable: false, length: DEFAULT_MAX_LENGTH })
  clientName: string;

  @Column({ name: 'client_phone_number', type: 'varchar', nullable: false, length: DEFAULT_MAX_LENGTH })
  clientPhoneNumber: string;

  @Column({ name: 'client_email_address', type: 'varchar', nullable: false, length: DEFAULT_MAX_LENGTH })
  clientEmailAddress: string;

  @Column({ name: 'products', type: 'text', nullable: false, transformer: arrayValueTransformer })
  products: string[];

  @Column({ name: 'type', type: 'varchar', nullable: false, length: ENUM_VALUE_MAX_LENGTH })
  type: string;

  @Column({
    name: 'pick_up_time',
    type: 'varchar',
    nullable: true,
    length: DATE_MAX_LENGTH,
    transformer: dateIsoStringValueTransformer,
  })
  pickUpDate?: Date;

  @Column({ name: 'delivery_address', type: 'text', nullable: true })
  deliveryAddress?: string;
}
