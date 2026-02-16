import React, { useState } from 'react';
import { NextPage } from 'next';
import { Pagination, Stack, Typography } from '@mui/material';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import { PropertyCard } from './PropertyCard';
import { useMutation, useQuery, useReactiveVar } from '@apollo/client';
import { Property } from '../../types/property/property';
import { AgentPropertiesInquiry } from '../../types/property/property.input';
import { T } from '../../types/common';
import { PropertyStatus } from '../../enums/property.enum';
import { userVar } from '../../../apollo/store';
import { useRouter } from 'next/router';
import { GET_AGENT_PROPERTIES, GET_PROPERTIES } from '../../../apollo/user/query';
import { UPDATE_PROPERTY } from '../../../apollo/user/mutation';
import { sweetConfirmAlert, sweetErrorHandling } from '../../sweetAlert';

const MyProperties: NextPage = ({ initialInput, ...props }: any) => {
	const device = useDeviceDetect();
	const [searchFilter, setSearchFilter] = useState<AgentPropertiesInquiry>(initialInput);
	const [agentProperties, setAgentProperties] = useState<Property[]>([]);
	const [total, setTotal] = useState<number>(0);
	const user = useReactiveVar(userVar);
	const router = useRouter();

	/** APOLLO REQUESTS **/
	const {
		loading: getPropertiesLoading,
		error: getPropertiesError,
		data: getPropertiesData,
		refetch: getPropertiesRefetch,
	} = useQuery(GET_AGENT_PROPERTIES, {
		fetchPolicy: 'network-only',
		variables: {
			input: initialInput,
		},
		notifyOnNetworkStatusChange: true,
		onCompleted: (data: T) => {
			setAgentProperties(data?.getAgentProperties?.list);
			setTotal(data?.getAgentProperties?.total);
		},
	}); // fazalarni olib beradi

	const [updateProperty] = useMutation(UPDATE_PROPERTY);

	/** HANDLERS **/
	const paginationHandler = (e: T, value: number) => {
		setSearchFilter({ ...searchFilter, page: value });
		getPropertiesRefetch({ input: { ...searchFilter, page: value } });
	};

	const changeStatusHandler = (value: PropertyStatus) => {
		setSearchFilter({ ...searchFilter, search: { propertyStatus: value } });
		getPropertiesRefetch({ input: { ...searchFilter, search: { propertyStatus: value } } });
	};

	const deletePropertyHandler = async (id: string) => {
		try {
			if (await sweetConfirmAlert('Are you sure to delete this property?')) {
				await updateProperty({
					variables: {
						input: {
							_id: id,
							propertyStatus: 'DELETE',
						},
					},
				});
				await getPropertiesRefetch({ input: searchFilter });
			}
		} catch (err: any) {
			await sweetErrorHandling(err);
		}
	};

	const updatePropertyHandler = async (status: string, id: string) => {
		try {
			if (await sweetConfirmAlert(`Are you sure change to ${status} status?`)) {
				await updateProperty({
					variables: {
						input: {
							_id: id,
							propertyStatus: status,
						},
					},
				});
				await getPropertiesRefetch({ input: searchFilter });
			}
		} catch (err: any) {
			await sweetErrorHandling(err);
		}
	};

	if (user?.memberType !== 'AGENT') {
		router.back();
	}

	if (device === 'mobile') {
		return <div>NESTAR PROPERTIES MOBILE</div>;
	} else {
		return (
			<div id="my-property-page">
				<Stack className="main-title-box">
					<Stack className="right-box">
						<Typography className="main-title">My Properties</Typography>
						<Typography className="sub-title">We are glad to see you again!</Typography>
					</Stack>
				</Stack>
				<Stack className="property-list-box">
					<Stack className="tab-name-box">
						<Typography
							onClick={() => changeStatusHandler(PropertyStatus.ACTIVE)}
							className={searchFilter.search.propertyStatus === 'ACTIVE' ? 'active-tab-name' : 'tab-name'}
						>
							On Sale
						</Typography>
						<Typography
							onClick={() => changeStatusHandler(PropertyStatus.SOLD)}
							className={searchFilter.search.propertyStatus === 'SOLD' ? 'active-tab-name' : 'tab-name'}
						>
							On Sold
						</Typography>
					</Stack>
					<Stack className="list-box">
						<Stack className="listing-title-box">
							<Typography className="title-text">Listing title</Typography>
							<Typography className="title-text">Date Published</Typography>
							<Typography className="title-text">Status</Typography>
							<Typography className="title-text">View</Typography>

							{searchFilter.search.propertyStatus === 'ACTIVE' && (
								<Typography className="title-text">Action</Typography>
							)}
						</Stack>

						{agentProperties?.length === 0 ? (
							<div className={'no-data'}>
								<img src="/img/icons/icoAlert.svg" alt="" />
								<p>No Property found!</p>
							</div>
						) : (
							agentProperties.map((property: Property) => {
								return (
									<PropertyCard
										property={property}
										deletePropertyHandler={deletePropertyHandler}
										updatePropertyHandler={updatePropertyHandler}
										key={property?._id}
									/>
								);
							})
						)}

						{agentProperties.length !== 0 && (
							<Stack className="pagination-config">
								<Stack className="pagination-box">
									<Pagination
										count={Math.ceil(total / searchFilter.limit) || 1}
										page={searchFilter.page}
										shape="circular"
										color="primary"
										onChange={paginationHandler}
									/>
								</Stack>
								<Stack className="total-result">
									<Typography>{total} property available</Typography>
								</Stack>
							</Stack>
						)}
					</Stack>
				</Stack>
			</div>
		);
	}
};

MyProperties.defaultProps = {
	initialInput: {
		page: 1,
		limit: 5,
		sort: 'createdAt',
		search: {
			propertyStatus: 'ACTIVE',
		},
	},
};

export default MyProperties;
